import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  type EstadoAnio,
  errorDeCampos,
  validarCambioEstado,
  validarDatosAnio,
} from './anio-academico.js';

// PB-013 (HU-011): años académicos de la escuela del administrador.
// CA4: la escuela nunca viene del navegador. CuentaService.operar fija la
// escuela de la sesión y la seguridad por fila oculta las demás (PB-141).
const PERFILES: Perfil[] = ['ADMIN'];

export type AnioAcademico = {
  id: string;
  anio: number;
  /** AAAA-MM-DD como texto, para que la zona horaria no cambie el día. */
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: EstadoAnio;
  /** Cursos creados en el año: con cursos, el número del año ya no cambia. */
  cursos: number;
};

type ErrorPostgres = { code?: string; constraint?: string };

// Decisión del PO: un año solo avanza de Planificado a Activo y de Activo a Cerrado.
const SIGUIENTE_ESTADO: Partial<Record<EstadoAnio, EstadoAnio>> = {
  PLANIFICADO: 'ACTIVO',
  ACTIVO: 'CERRADO',
};

const NOMBRE_ESTADO: Record<EstadoAnio, string> = {
  PLANIFICADO: 'Planificado',
  ACTIVO: 'Activo',
  CERRADO: 'Cerrado',
};

const COLUMNAS = `
  a.id, a.anio, a.fecha_inicio::text AS fecha_inicio,
  a.fecha_fin::text AS fecha_fin, a.estado,
  (SELECT count(*) FROM convi.cursos c
    WHERE c.anio_academico_id = a.id)::int AS cursos`;

// El cliente recibido ya debe tener la escuela y los permisos de la operación.
export async function consultarAnios(db: PoolClient) {
  const resultado = await db.query<AnioAcademico>(
    `SELECT ${COLUMNAS} FROM convi.anios_academicos a ORDER BY a.anio DESC`,
  );
  return resultado.rows;
}

function yaHayActivo(anio?: number) {
  return new ConflictException(
    `Ya hay un año activo${anio ? ` (${anio})` : ''}. Ciérralo antes de activar otro.`,
  );
}

@Injectable()
export class AniosService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Del más reciente al más antiguo.
  listar(sesion: Sesion): Promise<AnioAcademico[]> {
    return this.operar(sesion, consultarAnios);
  }

  // CA3: un año nuevo siempre parte Planificado, aunque el cuerpo diga otra cosa.
  crear(sesion: Sesion, cuerpo: unknown): Promise<AnioAcademico> {
    const datos = validarDatosAnio(cuerpo);
    return this.operar(sesion, async (db) => {
      const resultado = await db.query<AnioAcademico>(
        `INSERT INTO convi.anios_academicos AS a
           (establecimiento_id, anio, fecha_inicio, fecha_fin, estado)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, 'PLANIFICADO')
         RETURNING ${COLUMNAS}`,
        [datos.anio, datos.fecha_inicio, datos.fecha_fin],
      );
      return resultado.rows[0];
    });
  }

  // Cambia el año y sus fechas. El número del año solo cambia mientras esté
  // Planificado y sin cursos, y un año Cerrado ya no se modifica.
  editar(sesion: Sesion, id: string, cuerpo: unknown): Promise<AnioAcademico> {
    const datos = validarDatosAnio(cuerpo);
    return this.operar(sesion, async (db) => {
      const actual = await bloquear(db, id);
      if (actual.estado === 'CERRADO')
        throw new ConflictException(
          'Un año académico cerrado ya no se modifica.',
        );
      if (
        datos.anio !== actual.anio &&
        (actual.estado !== 'PLANIFICADO' || actual.cursos > 0)
      )
        throw errorDeCampos({
          anio: 'El año solo se puede cambiar mientras esté Planificado y sin cursos.',
        });
      const resultado = await db.query<AnioAcademico>(
        `UPDATE convi.anios_academicos AS a
         SET anio = $2, fecha_inicio = $3, fecha_fin = $4
         WHERE a.id = $1
         RETURNING ${COLUMNAS}`,
        [id, datos.anio, datos.fecha_inicio, datos.fecha_fin],
      );
      return resultado.rows[0];
    });
  }

  // Activa o cierra el año, siempre un paso hacia adelante. Solo puede haber un
  // año Activo: la API lo revisa aquí y el índice anios_academicos_un_activo lo
  // asegura en la base si dos personas activan años a la vez.
  cambiarEstado(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<AnioAcademico> {
    const destino = validarCambioEstado(cuerpo);
    return this.operar(sesion, async (db) => {
      const actual = await bloquear(db, id);
      if (SIGUIENTE_ESTADO[actual.estado] !== destino)
        throw new ConflictException(
          actual.estado === destino
            ? `El año ${actual.anio} ya está ${NOMBRE_ESTADO[destino]}.`
            : 'Un año académico solo avanza de Planificado a Activo y de Activo a Cerrado.',
        );
      if (destino === 'ACTIVO') {
        const activo = await db.query<{ anio: number }>(
          `SELECT anio FROM convi.anios_academicos WHERE estado = 'ACTIVO'`,
        );
        if (activo.rows.length > 0) throw yaHayActivo(activo.rows[0].anio);
      }
      // La base guarda el antes y el después del cambio en eventos_auditoria.
      const resultado = await db.query<AnioAcademico>(
        `UPDATE convi.anios_academicos AS a
         SET estado = $2
         WHERE a.id = $1
         RETURNING ${COLUMNAS}`,
        [id, destino],
      );
      return resultado.rows[0];
    });
  }

  // Todas las rutas son del administrador y traducen igual los errores del modelo.
  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        try {
          return await trabajo(db);
        } catch (error) {
          throw traducirError(error);
        }
      },
    );
  }
}

// Bloquea el año hasta el final de la operación, para que dos cambios
// simultáneos sobre el mismo año no se pisen.
async function bloquear(db: PoolClient, id: string) {
  const resultado = await db.query<AnioAcademico>(
    `SELECT ${COLUMNAS} FROM convi.anios_academicos a WHERE a.id = $1 FOR UPDATE OF a`,
    [id],
  );
  if (resultado.rows.length === 0)
    throw new NotFoundException('No encontramos ese año académico.');
  return resultado.rows[0];
}

// Convierte los errores conocidos del modelo en respuestas claras. Los demás
// siguen su curso: CuentaService.operar revierte y responde 503.
function traducirError(error: unknown) {
  const { code, constraint } = (error ?? {}) as ErrorPostgres;
  // CA1: el año no se repite dentro de la escuela.
  if (
    code === '23505' &&
    constraint === 'anios_academicos_establecimiento_id_anio_key'
  )
    return errorDeCampos({ anio: 'Ese año ya está registrado en tu escuela.' });
  // Otra persona activó un año al mismo tiempo.
  if (code === '23505' && constraint === 'anios_academicos_un_activo')
    return yaHayActivo();
  // Otra persona cambió este mismo año mientras se guardaba.
  if (code === '40001')
    return new ConflictException(
      'El año académico cambió mientras guardabas. Recarga la página e inténtalo de nuevo.',
    );
  return error;
}
