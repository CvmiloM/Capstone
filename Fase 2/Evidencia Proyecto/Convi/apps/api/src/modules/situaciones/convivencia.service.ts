import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { validarCambioUrgencia } from './cambio-urgencia.js';
import { URGENCIAS } from './nueva-situacion.js';

// PB-044 (HU-037): bandeja y revisión inicial del equipo de Convivencia.
// La seguridad por fila de la base separa por escuela y Convivencia ve todas
// las situaciones de la suya; CuentaService.operar exige el segundo factor.
const PERFILES: Perfil[] = ['CONVIVENCIA'];

export const ESTADOS = [
  'NUEVA',
  'EN_REVISION',
  'INFORMACION_SOLICITADA',
  'ANTECEDENTE',
  'DESCARTADA',
  'VINCULADA_CASO',
] as const;

// Estados en que la situación sigue abierta y su urgencia todavía se ajusta.
const ESTADOS_ABIERTOS = ['NUEVA', 'EN_REVISION', 'INFORMACION_SOLICITADA'];

/** Tope de filas de la bandeja; los totales siempre cuentan todas (CA4). */
export const MAXIMO_BANDEJA = 200;

export type SituacionBandeja = {
  id: string;
  codigo: string;
  ocurrido_en: Date;
  reportado_en: Date;
  estado: string;
  urgencia: string;
  tipo_origen: string;
  curso: string | null;
  categoria: string | null;
  reportado_por: string;
  estudiantes: number;
  aclaraciones_pendientes: number;
};

export type Bandeja = {
  situaciones: SituacionBandeja[];
  /** Cantidad de situaciones por estado y urgencia, sin filtros. */
  conteo: { estado: string; urgencia: string; total: number }[];
  limite: number;
};

export type DetalleConvivencia = SituacionBandeja & {
  lugar: string | null;
  descripcion: string;
  participantes: {
    nombres: string;
    apellidos: string;
    codigo_estudiante: string | null;
    rol: string;
    /** Curso de la matrícula que tenía al registrarse (HU-035 CA4). */
    curso_matricula: string | null;
  }[];
  aclaraciones: {
    id: string;
    pregunta: string;
    solicitado_por: string;
    solicitado_en: Date;
    estado: string;
    respuesta: string | null;
    respondido_en: Date | null;
  }[];
};

const NO_EXISTE = 'La situación no existe.';
const CAMBIO_SIMULTANEO =
  'Otra persona cambió esta situación al mismo tiempo. Recarga la página para ver su estado actual.';

// PB-139: si otra petición cambió la misma fila después de que empezó esta
// transacción, PostgreSQL rechaza el cambio (40001) en vez de sobrescribirlo.
function esCambioSimultaneo(error: unknown) {
  return (error as { code?: string } | null)?.code === '40001';
}

function filtro<T extends string>(
  valor: unknown,
  permitidos: readonly T[],
): T | null {
  if (valor === undefined || valor === '') return null;
  if (
    typeof valor === 'string' &&
    (permitidos as readonly string[]).includes(valor)
  )
    return valor as T;
  throw new BadRequestException('Filtro no válido.');
}

const COLUMNAS_BANDEJA = `
  s.id, s.codigo, s.ocurrido_en, s.reportado_en, s.estado, s.urgencia,
  s.tipo_origen, c.nombre AS curso, cat.nombre AS categoria,
  p.nombres || ' ' || p.apellidos AS reportado_por,
  (SELECT count(*) FROM convi.participaciones pa
    JOIN convi.estudiantes e ON e.persona_id = pa.persona_id
    WHERE pa.situacion_id = s.id AND pa.activo_hasta IS NULL)::int AS estudiantes,
  (SELECT count(*) FROM convi.aclaraciones_situacion a
    WHERE a.situacion_id = s.id AND a.estado = 'PENDIENTE')::int AS aclaraciones_pendientes`;

const DESDE_BANDEJA = `
  FROM convi.situaciones s
  JOIN convi.membresias_establecimiento m ON m.id = s.reportado_por_membresia_id
  JOIN convi.personas p ON p.id = m.persona_id
  LEFT JOIN convi.cursos c ON c.id = s.curso_contexto_id
  LEFT JOIN convi.categorias_convivencia cat ON cat.id = s.categoria_id`;

@Injectable()
export class ConvivenciaService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // CA1 y CA4: bandeja filtrada por estado y urgencia, la más urgente primero.
  // La lista y los totales se leen en la misma transacción, así que coinciden.
  bandeja(
    sesion: Sesion,
    estadoPedido: unknown,
    urgenciaPedida: unknown,
  ): Promise<Bandeja> {
    const estado = filtro(estadoPedido, ESTADOS);
    const urgencia = filtro(urgenciaPedida, URGENCIAS);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const situaciones = await db.query<SituacionBandeja>(
          `SELECT ${COLUMNAS_BANDEJA}
           ${DESDE_BANDEJA}
           WHERE ($1::text IS NULL OR s.estado = $1)
             AND ($2::text IS NULL OR s.urgencia = $2)
           ORDER BY CASE s.urgencia WHEN 'INMEDIATA' THEN 0
                                    WHEN 'URGENTE' THEN 1 ELSE 2 END,
                    s.reportado_en DESC
           LIMIT $3`,
          [estado, urgencia, MAXIMO_BANDEJA],
        );
        const conteo = await db.query<Bandeja['conteo'][number]>(
          `SELECT estado, urgencia, count(*)::int AS total
           FROM convi.situaciones
           GROUP BY estado, urgencia`,
        );
        return {
          situaciones: situaciones.rows,
          conteo: conteo.rows,
          limite: MAXIMO_BANDEJA,
        };
      },
    );
  }

  // Detalle completo para revisar: participantes con su curso histórico y las
  // aclaraciones pedidas. Otra escuela no la ve por la seguridad por fila.
  situacion(sesion: Sesion, id: string): Promise<DetalleConvivencia> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const base = await db.query<
          SituacionBandeja & { lugar: string | null; descripcion: string }
        >(
          `SELECT ${COLUMNAS_BANDEJA}, s.lugar, s.descripcion
           ${DESDE_BANDEJA}
           WHERE s.id = $1`,
          [id],
        );
        const situacion = base.rows[0];
        if (!situacion) throw new NotFoundException(NO_EXISTE);

        const participantes = await db.query<
          DetalleConvivencia['participantes'][number]
        >(
          `SELECT p.nombres, p.apellidos, e.codigo_estudiante,
                  pa.rol_contextual AS rol, cm.nombre AS curso_matricula
           FROM convi.participaciones pa
           JOIN convi.personas p ON p.id = pa.persona_id
           LEFT JOIN convi.estudiantes e ON e.persona_id = p.id
           LEFT JOIN convi.matriculas mt ON mt.id = pa.matricula_contexto_id
           LEFT JOIN convi.cursos cm ON cm.id = mt.curso_id
           WHERE pa.situacion_id = $1 AND pa.activo_hasta IS NULL
           ORDER BY p.apellidos, p.nombres`,
          [id],
        );
        const aclaraciones = await db.query<
          DetalleConvivencia['aclaraciones'][number]
        >(
          `SELECT a.id, a.pregunta,
                  ps.nombres || ' ' || ps.apellidos AS solicitado_por,
                  a.solicitado_en, a.estado, a.respuesta, a.respondido_en
           FROM convi.aclaraciones_situacion a
           JOIN convi.membresias_establecimiento ms ON ms.id = a.solicitado_por
           JOIN convi.personas ps ON ps.id = ms.persona_id
           WHERE a.situacion_id = $1
           ORDER BY a.solicitado_en`,
          [id],
        );
        return {
          ...situacion,
          participantes: participantes.rows,
          aclaraciones: aclaraciones.rows,
        };
      },
    );
  }

  // CA2: una situación Nueva pasa a En revisión; la urgencia no cambia. Si ya
  // está En revisión responde lo mismo, así que repetir el clic no hace daño.
  // Si otra persona la inició al mismo tiempo se reintenta una vez y entonces
  // ya se ve En revisión.
  async iniciarRevision(
    sesion: Sesion,
    id: string,
  ): Promise<{ id: string; estado: string }> {
    for (let intento = 1; ; intento++) {
      try {
        return await this.cuentas.operar(
          sesion,
          { tipo: 'establecimiento', perfiles: PERFILES },
          async (db) => {
            const actual = await db
              .query<{ estado: string }>(
                'SELECT estado FROM convi.situaciones WHERE id = $1 FOR UPDATE',
                [id],
              )
              .catch((error: unknown) => {
                if (esCambioSimultaneo(error))
                  throw new ConflictException(CAMBIO_SIMULTANEO);
                throw error;
              });
            const fila = actual.rows[0];
            if (!fila) throw new NotFoundException(NO_EXISTE);
            if (fila.estado === 'EN_REVISION')
              return { id, estado: fila.estado };
            if (fila.estado !== 'NUEVA')
              throw new ConflictException(
                'Solo una situación Nueva inicia su revisión.',
              );
            const cambio = await db.query<{ id: string; estado: string }>(
              `UPDATE convi.situaciones SET estado = 'EN_REVISION'
               WHERE id = $1 RETURNING id, estado`,
              [id],
            );
            return cambio.rows[0];
          },
        );
      } catch (error) {
        const reintentar =
          error instanceof ConflictException &&
          error.message === CAMBIO_SIMULTANEO &&
          intento < 2;
        if (!reintentar) throw error;
      }
    }
  }

  // CA3: cambiar la urgencia exige motivo; el trigger de auditoría guarda el
  // antes, el después, quién y el motivo. Si la urgencia cambió desde que la
  // persona la vio, se rechaza en vez de sobrescribir (PB-139).
  cambiarUrgencia(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<{ id: string; urgencia: string }> {
    const cambio = validarCambioUrgencia(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const actual = await db
          .query<{ estado: string; urgencia: string }>(
            'SELECT estado, urgencia FROM convi.situaciones WHERE id = $1 FOR UPDATE',
            [id],
          )
          .catch((error: unknown) => {
            if (esCambioSimultaneo(error))
              throw new ConflictException(CAMBIO_SIMULTANEO);
            throw error;
          });
        const fila = actual.rows[0];
        if (!fila) throw new NotFoundException(NO_EXISTE);
        if (fila.urgencia !== cambio.urgencia_anterior)
          throw new ConflictException(CAMBIO_SIMULTANEO);
        if (!ESTADOS_ABIERTOS.includes(fila.estado))
          throw new ConflictException(
            'La revisión de esta situación ya terminó; su urgencia no se cambia.',
          );

        // validar_integracion exige app.motivo_cambio para cambiar la urgencia.
        await db.query("SELECT set_config('app.motivo_cambio', $1, true)", [
          cambio.motivo,
        ]);
        const resultado = await db.query<{ id: string; urgencia: string }>(
          `UPDATE convi.situaciones SET urgencia = $2
           WHERE id = $1 RETURNING id, urgencia`,
          [id, cambio.urgencia],
        );
        return resultado.rows[0];
      },
    );
  }
}
