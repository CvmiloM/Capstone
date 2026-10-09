import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import {
  PERFILES,
  type Cuenta,
  type Identidad,
  type Perfil,
  type Sesion,
} from '../common/sesion.js';

export const BASE_DE_DATOS = Symbol('base-de-datos');
type Permisos = { perfiles: readonly Perfil[] };
// establecimiento limita la escuela; estudiantes y casos requieren su permiso específico.
export type AccesoRegistro = Permisos &
  (
    | { tipo: 'establecimiento' }
    | { tipo: 'estudiante'; id: string }
    | { tipo: 'caso'; id: string; estudianteId?: string }
    | { tipo: 'curso_reporte'; id: string }
  );
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CuentaService implements OnModuleDestroy {
  constructor(@Inject(BASE_DE_DATOS) private readonly pool: Pool) {}

  // Consultar la cuenta actual no concede por sí solo permiso sobre estudiantes o casos.
  async resolver(identidad: Identidad): Promise<Cuenta> {
    return this.transaccion(
      identidad,
      true,
      async (_cliente, cuenta) => cuenta,
    );
  }

  /**
   * Usar la sesión creada por el servidor y los perfiles definidos para esta operación.
   * El trabajo consulta o cambia solo el registro autorizado, usando el cliente recibido.
   * Permitir leer no permite modificar: declarar los perfiles de cada acción.
   */
  async operar<T>(
    sesion: Sesion,
    acceso: AccesoRegistro,
    trabajo: (cliente: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (
      'id' in acceso &&
      (!UUID.test(acceso.id) ||
        (acceso.tipo === 'caso' &&
          acceso.estudianteId !== undefined &&
          !UUID.test(acceso.estudianteId)))
    ) {
      throw new BadRequestException('Registro no válido.');
    }
    // Volvemos a consultar la cuenta para detectar cambios desde la entrada a la ruta.
    return this.transaccion(sesion, false, async (cliente, cuenta) => {
      if (
        cuenta.membresia_id !== sesion.membresia_id ||
        cuenta.establecimiento_id !== sesion.establecimiento_id ||
        cuenta.codigo_perfil !== sesion.codigo_perfil ||
        !acceso.perfiles.includes(cuenta.codigo_perfil) ||
        (cuenta.requiere_segundo_factor && sesion.aal !== 'aal2')
      ) {
        throw new ForbiddenException('No tienes permiso para esta operación.');
      }
      await cliente.query(
        `SELECT set_config('app.membresia_id', $1, true),
                set_config('app.establecimiento_id', $2, true)`,
        [cuenta.membresia_id, cuenta.establecimiento_id],
      );
      // Una suspensión de la cuenta o escuela espera a que termine esta operación.
      const vigente = await cliente.query(
        `SELECT m.id FROM convi.membresias_establecimiento m
         JOIN convi.establecimientos e ON e.id = m.establecimiento_id
         WHERE m.id = $1 AND convi.sesion_valida() FOR SHARE OF m, e`,
        [cuenta.membresia_id],
      );
      if (vigente.rows.length !== 1)
        throw new ForbiddenException('Cuenta no disponible.');
      let autorizado = true;
      if (acceso.tipo !== 'establecimiento') {
        // Los nombres de las funciones son fijos; el navegador solo aporta identificadores.
        const consulta =
          acceso.tipo === 'estudiante'
            ? {
                sql: 'SELECT convi.puede_ver_estudiante($1::uuid) AS permitido',
                valores: [acceso.id],
              }
            : acceso.tipo === 'caso'
              ? {
                  sql: 'SELECT convi.puede_ver_caso($1::uuid, $2::uuid) AS permitido',
                  valores: [acceso.id, acceso.estudianteId ?? null],
                }
              : {
                  sql: 'SELECT convi.puede_reportar_curso($1::uuid) AS permitido',
                  valores: [acceso.id],
                };
        const permiso = await cliente.query<{ permitido: boolean }>(
          consulta.sql,
          consulta.valores,
        );
        autorizado = permiso.rows[0]?.permitido === true;
      }
      if (!autorizado)
        throw new ForbiddenException('No tienes permiso para este registro.');
      // La autorización y el trabajo usan la misma conexión y el mismo contexto.
      return trabajo(cliente);
    });
  }

  private async transaccion<T>(
    identidad: Identidad,
    soloLectura: boolean,
    trabajo: (cliente: PoolClient, cuenta: Cuenta) => Promise<T>,
  ): Promise<T> {
    const cliente = await this.pool.connect().catch(() => {
      throw new ServiceUnavailableException('No se pudo consultar la cuenta.');
    });
    let descartarConexion = false;
    try {
      // El permiso y el trabajo deben ver los mismos datos durante toda la operación.
      await cliente.query(
        soloLectura
          ? 'BEGIN READ ONLY'
          : 'BEGIN ISOLATION LEVEL REPEATABLE READ',
      );
      await cliente.query('SET LOCAL ROLE convi_backend');
      await cliente.query(
        `SELECT set_config('app.auth_usuario_id', $1, true),
                set_config('app.aal', $2, true),
                set_config('app.membresia_id', '', true),
                set_config('app.establecimiento_id', '', true)`,
        [identidad.authUsuarioId, identidad.aal],
      );
      const resultado = await cliente.query<Cuenta>(
        'SELECT * FROM convi.resolver_membresia()',
      );
      const cuenta =
        resultado.rows.length === 1 ? resultado.rows[0] : undefined;
      if (!cuenta || !PERFILES.includes(cuenta.codigo_perfil))
        throw new ForbiddenException('Cuenta no disponible.');
      const respuesta = await trabajo(cliente, cuenta);
      await cliente.query('COMMIT');
      return respuesta;
    } catch (error) {
      try {
        await cliente.query('ROLLBACK');
      } catch {
        descartarConexion = true;
      }
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'No se pudo completar la operación.',
      );
    } finally {
      // Ni la identidad ni la escuela quedan aplicadas al siguiente usuario de la conexión.
      cliente.release(descartarConexion);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
