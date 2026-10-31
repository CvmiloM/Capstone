import {
  BadRequestException,
  ConflictException,
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
/**
 * REPEATABLE READ para todo, salvo operaciones que esperan su turno con un bloqueo
 * propio y deben ver lo que otra guardó mientras esperaban, como las altas de documentos.
 */
export type Aislamiento = 'REPEATABLE READ' | 'READ COMMITTED';

@Injectable()
export class CuentaService implements OnModuleDestroy {
  constructor(@Inject(BASE_DE_DATOS) private readonly pool: Pool) {}

  // Consultar la cuenta actual no concede por sí solo permiso sobre estudiantes o casos.
  async resolver(identidad: Identidad): Promise<Cuenta> {
    return this.transaccion(
      identidad,
      'SOLO LECTURA',
      async (_cliente, cuenta) => cuenta,
    );
  }

  /**
   * Para una ruta con @CorreoVerificado: crear la escuela antes de tener cuenta.
   * Usar solo las funciones de registro del modelo y la identidad de peticion.identidad.
   * No consulta tablas del portal ni acepta escuela o perfil elegidos por el navegador.
   */
  async operarRegistro<T>(
    identidad: Identidad,
    trabajo: (cliente: PoolClient) => Promise<T>,
  ): Promise<T> {
    const cliente = await this.pool.connect().catch(() => {
      throw new ServiceUnavailableException('No se pudo iniciar el registro.');
    });
    let descartarConexion = false;
    try {
      // READ COMMITTED deja que un reintento vea la escuela creada mientras esperaba el bloqueo.
      await cliente.query(
        'BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL ROLE convi_registro',
      );
      await cliente.query(
        `SELECT set_config('app.auth_usuario_id', $1, true),
                set_config('app.aal', $2, true),
                set_config('app.membresia_id', '', true),
                set_config('app.establecimiento_id', '', true)`,
        [identidad.authUsuarioId, identidad.aal],
      );
      const respuesta = await trabajo(cliente);
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
        'No se pudo completar el registro.',
      );
    } finally {
      // El rol y el contexto terminan con la transacción; no pasan al siguiente usuario.
      cliente.release(descartarConexion);
    }
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
    aislamiento: Aislamiento = 'REPEATABLE READ',
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
    return this.transaccion(sesion, aislamiento, async (cliente, cuenta) => {
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
      // current_date y los permisos del modelo usan el día de esta escuela, no UTC.
      // LOCAL evita que su zona horaria pase al siguiente usuario del pool.
      await cliente.query(
        `SELECT set_config('TimeZone', e.zona_horaria, true)
         FROM convi.establecimientos e WHERE e.id = $1`,
        [cuenta.establecimiento_id],
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

  /**
   * PB-090 (HU-079 CA5): trabajo del motor de reglas, sin sesión de persona.
   * Usa la identidad técnica convi_motor_reglas, que solo lee fechas,
   * categorías, cursos y estados, y solo crea alertas, avisos y el registro
   * de su ejecución. Evalúa una escuela por transacción con su zona horaria.
   * Si la escuela no existe o no está activa no hace nada y devuelve null.
   */
  async operarMotor<T>(
    establecimientoId: string,
    trabajo: (cliente: PoolClient) => Promise<T>,
  ): Promise<T | null> {
    if (!UUID.test(establecimientoId))
      throw new BadRequestException('Escuela no válida.');
    const cliente = await this.pool.connect();
    let descartarConexion = false;
    try {
      // READ COMMITTED: cada consulta ve lo ya confirmado, incluida la
      // situación recién guardada y las alertas de una evaluación anterior.
      await cliente.query(
        'BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL ROLE convi_motor_reglas',
      );
      await cliente.query(
        `SELECT set_config('app.auth_usuario_id', '', true),
                set_config('app.aal', '', true),
                set_config('app.membresia_id', '', true),
                set_config('app.establecimiento_id', $1, true)`,
        [establecimientoId],
      );
      // Dos evaluaciones de la misma escuela esperan su turno, aunque corran
      // en dos copias de la API: así no se generan dos alertas por la misma racha.
      await cliente.query(
        `SELECT pg_advisory_xact_lock(hashtext('convi_motor_reglas'), hashtext($1))`,
        [establecimientoId],
      );
      // La política del motor solo deja ver la escuela si está activa.
      const escuela = await cliente.query<{ zona_horaria: string }>(
        `SELECT zona_horaria FROM convi.establecimientos
         WHERE id = convi.establecimiento_actual()`,
      );
      if (escuela.rows.length !== 1) {
        await cliente.query('ROLLBACK');
        return null;
      }
      // current_date y ::date usan el día de la escuela, no UTC.
      await cliente.query(`SELECT set_config('TimeZone', $1, true)`, [
        escuela.rows[0].zona_horaria,
      ]);
      const respuesta = await trabajo(cliente);
      await cliente.query('COMMIT');
      return respuesta;
    } catch (error) {
      try {
        await cliente.query('ROLLBACK');
      } catch {
        descartarConexion = true;
      }
      throw error;
    } finally {
      // El rol técnico y la escuela terminan con la transacción.
      cliente.release(descartarConexion);
    }
  }

  /**
   * PB-091 y PB-092: las escuelas activas que tienen reglas diarias activas,
   * para la evaluación de cada mañana. La identidad técnica del motor solo ve
   * la escuela de cada transacción, así que la lista la entrega una función
   * de la base que devuelve solo identificadores.
   */
  escuelasConReglasDiarias(): Promise<string[]> {
    return this.escuelasDelMotor('motor_escuelas_con_reglas_diarias');
  }

  /**
   * PB-094 (HU-081, Fernando): todas las escuelas activas, para los avisos de
   * lo que vence cada día, tengan o no reglas.
   */
  escuelasActivas(): Promise<string[]> {
    return this.escuelasDelMotor('motor_escuelas_activas');
  }

  private async escuelasDelMotor(
    funcion: 'motor_escuelas_con_reglas_diarias' | 'motor_escuelas_activas',
  ): Promise<string[]> {
    const cliente = await this.pool.connect();
    let descartarConexion = false;
    try {
      await cliente.query('BEGIN READ ONLY; SET LOCAL ROLE convi_motor_reglas');
      // El nombre de la función es fijo, no viene de la petición.
      const filas = await cliente.query<{ id: string }>(
        `SELECT id FROM convi.${funcion}() AS id`,
      );
      await cliente.query('COMMIT');
      return filas.rows.map((f) => f.id);
    } catch (error) {
      try {
        await cliente.query('ROLLBACK');
      } catch {
        descartarConexion = true;
      }
      throw error;
    } finally {
      cliente.release(descartarConexion);
    }
  }

  private async transaccion<T>(
    identidad: Identidad,
    modo: 'SOLO LECTURA' | Aislamiento,
    trabajo: (cliente: PoolClient, cuenta: Cuenta) => Promise<T>,
  ): Promise<T> {
    const cliente = await this.pool.connect().catch(() => {
      throw new ServiceUnavailableException('No se pudo consultar la cuenta.');
    });
    let descartarConexion = false;
    try {
      // El permiso y el trabajo deben ver los mismos datos durante toda la operación.
      // Las instrucciones fijas comparten un viaje; los datos siguen parametrizados.
      await cliente.query(
        modo === 'SOLO LECTURA'
          ? 'BEGIN READ ONLY; SET LOCAL ROLE convi_backend'
          : modo === 'READ COMMITTED'
            ? 'BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL ROLE convi_backend'
            : 'BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE convi_backend',
      );
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
      if (
        ['40001', '40P01'].includes(
          (error as { code?: string } | null)?.code ?? '',
        )
      )
        throw new ConflictException(
          'Otra operación cambió los datos mientras trabajabas, recarga la página e inténtalo nuevamente',
        );
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
