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
import {
  cambiosDeSituacion,
  type CambioSituacion,
} from './cambios-situacion.js';
import { opcionesCaso, type OpcionesCaso } from './caso-nuevo.js';
import {
  decisionesDeSituacion,
  insertarDecision,
  ultimaRevision,
  validarDecision,
  type DecisionRegistrada,
} from './decision-situacion.js';
import {
  evidenciasDeSituacion,
  type EvidenciaRegistrada,
} from './evidencias.service.js';
import { validarPregunta } from './nueva-aclaracion.js';
import {
  guardarComoAntecedente,
  validarRegistroHistorico,
} from './registro-historico.js';
import {
  errorDeCampos,
  URGENCIAS,
  validarSituacionConvivencia,
} from './nueva-situacion.js';
import {
  comprobarFechaYCategoria,
  conReintentosDeCodigo,
  insertarSituacion,
  matriculasAlOcurrir,
  type SituacionRegistrada,
} from './registro-situacion.js';
import {
  esReconsiderable,
  leerMotivoReconsideracion,
  prefijoReconsideracion,
} from './reconsideracion.js';
import { validarCambioResponsable } from './responsable-revision.js';
import {
  comprobarNormativaVigente,
  insertarRevisionNormativa,
  opcionesNormativa,
  revisionesNormativas,
  validarRevisionNormativa,
  type OpcionesNormativa,
  type RevisionNormativa,
} from './revision-normativa.js';

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
  /** Quién informó, cuando la registró Convivencia por otro canal (HU-036). */
  informante: string | null;
  /** PB-046 (HU-039): membresía y nombre de quien revisa, si ya se asignó. */
  responsable_id: string | null;
  responsable: string | null;
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
    /** PB-074: para abrir su historial; null si no es estudiante. */
    estudiante_id: string | null;
    nombres: string;
    apellidos: string;
    codigo_estudiante: string | null;
    rol: string;
    /** Curso y año de la matrícula del día del hecho; null si no tenía (HU-066). */
    curso_matricula: string | null;
    /** Curso y año de su matrícula activa hoy, aparte del anterior (HU-066 CA2). */
    curso_actual: string | null;
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
  /** PB-046 (HU-039 CA1): cuentas de Convivencia activas que pueden revisar. */
  opciones_responsable: { id: string; nombre: string; propia: boolean }[];
  /** PB-155 (HU-134): lo que se registró del reglamento o protocolo. */
  revisiones_normativas: RevisionNormativa[];
  /** PB-155: versiones publicadas y vigentes que se pueden citar. */
  opciones_normativa: OpcionesNormativa;
  /** PB-047, PB-048 y PB-051: decisiones tomadas, sin editar ni borrar. */
  decisiones: DecisionRegistrada[];
  /** PB-139: la última revisión que se ve; decidir sobre otra se rechaza. */
  ultima_revision_id: string | null;
  /** PB-053: el caso al que quedó vinculada, quién y cuándo (HU-045 CA2). */
  caso_vinculado: {
    id: string;
    codigo: string;
    vinculado_por: string;
    vinculado_en: Date;
  } | null;
  /** PB-053 y PB-052: lo que necesitan los formularios de la sección Caso. */
  opciones_caso: OpcionesCaso;
  /** PB-066: evidencias de la situación y de las respuestas a sus aclaraciones. */
  evidencias: EvidenciaRegistrada[];
  /** PB-142 (HU-121): la registró Convivencia como registro histórico (PB-075). */
  registro_historico: boolean;
  /** PB-142 (HU-121): cambios de estado, urgencia o responsable, con quién y por qué. */
  cambios: CambioSituacion[];
};

export type ResponsableAsignado = {
  id: string;
  estado: string;
  responsable_id: string;
};

// PB-043 (HU-036 CA1): cómo se comprueba que el informante sea del origen indicado.
const CONSULTA_INFORMANTE = {
  ESTUDIANTE: 'SELECT 1 FROM convi.estudiantes WHERE persona_id = $1',
  FUNCIONARIO: `SELECT 1 FROM convi.membresias_establecimiento
     WHERE persona_id = $1 AND estado = 'ACTIVO' AND codigo_perfil <> 'APODERADO'`,
  APODERADO:
    'SELECT 1 FROM convi.apoderados_estudiante WHERE persona_apoderado_id = $1',
} as const;

const NO_EXISTE = 'La situación no existe.';
const CAMBIO_SIMULTANEO =
  'Otra persona cambió esta situación al mismo tiempo. Recarga la página para ver su estado actual.';
const RESPONSABLE_SIMULTANEO =
  'Otra persona cambió al responsable mientras mirabas la situación. Recarga la página para ver quién quedó a cargo.';
const PRIMERA_ASIGNACION = 'Primera asignación del responsable de la revisión.';
const DECISION_DESACTUALIZADA =
  'Otra persona registró una revisión o una decisión mientras mirabas la situación. Recarga la página para verla antes de decidir.';

type EstudianteOpcion = {
  id: string;
  persona_id: string;
  nombres: string;
  apellidos: string;
  codigo_estudiante: string;
};

/** Lo que necesita el formulario de registro de Convivencia (PB-043). */
export type OpcionesRegistro = {
  categorias: { id: string; nombre: string }[];
  /** Cursos con matrículas activas y sus estudiantes. */
  cursos: {
    id: string;
    nombre: string;
    estudiantes: EstudianteOpcion[];
  }[];
  /** Estudiantes sin matrícula activa hoy, como retirados o egresados (HU-066). */
  sin_matricula: EstudianteOpcion[];
  /** Personas con una cuenta activa del equipo de la escuela. */
  funcionarios: { persona_id: string; nombre: string }[];
  /** Apoderados con un vínculo vigente con algún estudiante. */
  apoderados: { persona_id: string; nombre: string }[];
};

export type AclaracionPedida = {
  id: string;
  estado: string;
  solicitado_en: Date;
  /** Estado de la situación después de pedirla (HU-038 CA1). */
  estado_situacion: string;
};

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
  po.nombres || ' ' || po.apellidos AS informante,
  s.asignado_a_membresia_id AS responsable_id,
  pr.nombres || ' ' || pr.apellidos AS responsable,
  (SELECT count(*) FROM convi.participaciones pa
    JOIN convi.estudiantes e ON e.persona_id = pa.persona_id
    WHERE pa.situacion_id = s.id AND pa.activo_hasta IS NULL)::int AS estudiantes,
  (SELECT count(*) FROM convi.aclaraciones_situacion a
    WHERE a.situacion_id = s.id AND a.estado = 'PENDIENTE')::int AS aclaraciones_pendientes`;

const DESDE_BANDEJA = `
  FROM convi.situaciones s
  JOIN convi.membresias_establecimiento m ON m.id = s.reportado_por_membresia_id
  JOIN convi.personas p ON p.id = m.persona_id
  LEFT JOIN convi.personas po ON po.id = s.persona_origen_id
  LEFT JOIN convi.membresias_establecimiento mr ON mr.id = s.asignado_a_membresia_id
  LEFT JOIN convi.personas pr ON pr.id = mr.persona_id
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
  // PB-142 (HU-121): también el historial de cambios que guardó la auditoría.
  situacion(sesion: Sesion, id: string): Promise<DetalleConvivencia> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const base = await db.query<
          SituacionBandeja & {
            lugar: string | null;
            descripcion: string;
            registro_historico: boolean;
          }
        >(
          `SELECT ${COLUMNAS_BANDEJA}, s.lugar, s.descripcion,
                  s.registro_historico
           ${DESDE_BANDEJA}
           WHERE s.id = $1`,
          [id],
        );
        const situacion = base.rows[0];
        if (!situacion) throw new NotFoundException(NO_EXISTE);

        const participantes = await db.query<
          DetalleConvivencia['participantes'][number]
        >(
          // PB-076 (HU-066 CA2): el curso del día del hecho y, aparte, el
          // actual. Un estudiante tiene a lo sumo una matrícula activa: sin
          // fecha de término chocaría con cualquier otra.
          `SELECT e.id AS estudiante_id, p.nombres, p.apellidos,
                  e.codigo_estudiante, pa.rol_contextual AS rol,
                  cm.nombre || ' (' || am.anio || ')' AS curso_matricula,
                  ca.nombre || ' (' || aa.anio || ')' AS curso_actual
           FROM convi.participaciones pa
           JOIN convi.personas p ON p.id = pa.persona_id
           LEFT JOIN convi.estudiantes e ON e.persona_id = p.id
           LEFT JOIN convi.matriculas mt ON mt.id = pa.matricula_contexto_id
           LEFT JOIN convi.cursos cm ON cm.id = mt.curso_id
           LEFT JOIN convi.anios_academicos am ON am.id = cm.anio_academico_id
           LEFT JOIN convi.matriculas ma
             ON ma.estudiante_id = e.id AND ma.estado = 'ACTIVO'
           LEFT JOIN convi.cursos ca ON ca.id = ma.curso_id
           LEFT JOIN convi.anios_academicos aa ON aa.id = ca.anio_academico_id
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
        // PB-144: el selector solo necesita la membresía y el nombre.
        const responsables = await db.query<
          DetalleConvivencia['opciones_responsable'][number]
        >(
          `SELECT m.id, p.nombres || ' ' || p.apellidos AS nombre,
                  m.id = convi.membresia_actual() AS propia
           FROM convi.membresias_establecimiento m
           JOIN convi.personas p ON p.id = m.persona_id
           WHERE m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO'
           ORDER BY p.apellidos, p.nombres`,
        );
        return {
          ...situacion,
          participantes: participantes.rows,
          aclaraciones: aclaraciones.rows,
          opciones_responsable: responsables.rows,
          revisiones_normativas: await revisionesNormativas(db, id),
          opciones_normativa: await opcionesNormativa(db),
          decisiones: await decisionesDeSituacion(db, id),
          ultima_revision_id: await ultimaRevision(db, id),
          caso_vinculado:
            (
              await db.query<NonNullable<DetalleConvivencia['caso_vinculado']>>(
                `SELECT c.id, c.codigo, s.vinculado_a_caso_en AS vinculado_en,
                        p.nombres || ' ' || p.apellidos AS vinculado_por
                 FROM convi.situaciones s
                 JOIN convi.casos c ON c.id = s.caso_id
                 JOIN convi.membresias_establecimiento m ON m.id = s.vinculado_a_caso_por
                 JOIN convi.personas p ON p.id = m.persona_id
                 WHERE s.id = $1`,
                [id],
              )
            ).rows[0] ?? null,
          opciones_caso: await opcionesCaso(db, id),
          evidencias: await evidenciasDeSituacion(db, id),
          cambios: await cambiosDeSituacion(db, id),
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

  // PB-046 (HU-039): asigna o cambia a quien revisa la situación. El estado no
  // cambia (CA4). Se indica el responsable que se veía: si otra persona lo
  // cambió entretanto, se rechaza en vez de reemplazarlo en silencio (CA2).
  // El trigger de auditoría guarda el antes, el después, quién y el motivo (CA3).
  asignarResponsable(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<ResponsableAsignado> {
    const cambio = validarCambioResponsable(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const actual = await db
          .query<{ estado: string; responsable_id: string | null }>(
            `SELECT estado, asignado_a_membresia_id AS responsable_id
             FROM convi.situaciones WHERE id = $1 FOR UPDATE`,
            [id],
          )
          .catch((error: unknown) => {
            if (esCambioSimultaneo(error))
              throw new ConflictException(RESPONSABLE_SIMULTANEO);
            throw error;
          });
        const fila = actual.rows[0];
        if (!fila) throw new NotFoundException(NO_EXISTE);
        if (fila.responsable_id !== cambio.responsable_anterior_id)
          throw new ConflictException(RESPONSABLE_SIMULTANEO);
        if (!ESTADOS_ABIERTOS.includes(fila.estado))
          throw new ConflictException(
            'La revisión de esta situación ya terminó; su responsable no se cambia.',
          );

        // CA1: una cuenta de Convivencia activa. La seguridad por fila ya deja
        // fuera las cuentas de otras escuelas.
        const elegido = await db.query(
          `SELECT 1 FROM convi.membresias_establecimiento
           WHERE id = $1 AND codigo_perfil = 'CONVIVENCIA' AND estado = 'ACTIVO'`,
          [cambio.responsable_id],
        );
        if (elegido.rowCount === 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. El responsable no cambió.',
            errores: {
              responsable_id:
                'Elige a una persona activa del equipo de Convivencia.',
            },
          });

        // validar_integracion exige app.motivo_cambio en cualquier cambio del
        // responsable, también en el primero.
        await db.query("SELECT set_config('app.motivo_cambio', $1, true)", [
          cambio.motivo ?? PRIMERA_ASIGNACION,
        ]);
        const resultado = await db.query<ResponsableAsignado>(
          `UPDATE convi.situaciones SET asignado_a_membresia_id = $2
           WHERE id = $1
           RETURNING id, estado, asignado_a_membresia_id AS responsable_id`,
          [id, cambio.responsable_id],
        );
        return resultado.rows[0];
      },
    );
  }

  // PB-155 (HU-134): registra lo que indica el reglamento o el protocolo
  // durante la revisión, antes de decidir. Es una consulta: el estado de la
  // situación no cambia (CA4). Si otra persona cambió la situación al mismo
  // tiempo se reintenta una vez con el estado nuevo.
  async registrarRevisionNormativa(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<{ id: string; revisado_en: Date }> {
    const datos = validarRevisionNormativa(cuerpo);
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
            if (fila.estado === 'NUEVA')
              throw new ConflictException(
                'Inicia la revisión antes de registrar lo que indica la normativa.',
              );
            if (
              !['EN_REVISION', 'INFORMACION_SOLICITADA'].includes(fila.estado)
            )
              throw new ConflictException(
                'La revisión de esta situación ya terminó; no se agregan más revisiones normativas.',
              );

            const errores = await comprobarNormativaVigente(db, datos);
            if (Object.keys(errores).length > 0)
              throw new BadRequestException({
                mensaje:
                  'Revisa los datos marcados. No se guardó la revisión normativa.',
                errores,
              });
            return insertarRevisionNormativa(db, id, datos);
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

  // PB-047 (HU-040), PB-048 (HU-041) y PB-051 (HU-044): Convivencia cierra la
  // revisión guardando la situación como antecedente o descartándola, sin
  // abrir un caso. Solo se decide En revisión: una Nueva todavía no se revisa
  // y con una aclaración pendiente se espera al profesor. Se indica la última
  // revisión que se veía; si otra persona agregó una, se rechaza (PB-139).
  // PB-050 (HU-043): una situación Antecedente o Descartada se reconsidera con
  // otra decisión distinta y el motivo del cambio.
  registrarDecision(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<{ id: string; estado: string }> {
    const datos = validarDecision(cuerpo);
    const motivo = leerMotivoReconsideracion(cuerpo);
    return this.cuentas.operar(
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
              throw new ConflictException(DECISION_DESACTUALIZADA);
            throw error;
          });
        const fila = actual.rows[0];
        if (!fila) throw new NotFoundException(NO_EXISTE);
        if (fila.estado === 'NUEVA')
          throw new ConflictException('Inicia la revisión antes de decidir.');
        if (fila.estado === 'INFORMACION_SOLICITADA')
          throw new ConflictException(
            'Espera la respuesta del profesor a la aclaración antes de decidir.',
          );
        if (fila.estado === 'VINCULADA_CASO')
          throw new ConflictException(
            'Esta situación está vinculada a un caso. No se traslada ni se desvincula.',
          );
        if (fila.estado !== 'EN_REVISION' && !esReconsiderable(fila.estado))
          throw new ConflictException(
            'En el estado actual de la situación no se puede decidir.',
          );
        if ((await ultimaRevision(db, id)) !== datos.revision_anterior_id)
          throw new ConflictException(DECISION_DESACTUALIZADA);
        // HU-043 CA1: reconsiderar es cambiar la decisión, no repetirla.
        if (datos.resultado === fila.estado)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se guardó la decisión.',
            errores: {
              resultado: 'La situación ya tiene esa decisión. Elige otra.',
            },
          });
        const prefijo = prefijoReconsideracion(fila.estado, motivo);

        // HU-044 CA2: la original se busca por su código dentro de la escuela
        // (la seguridad por fila oculta las demás) y no puede ser la misma.
        let originalId: string | null = null;
        if (datos.codigo_original) {
          const original = await db.query<{ id: string }>(
            'SELECT id FROM convi.situaciones WHERE codigo = $1',
            [datos.codigo_original],
          );
          originalId = original.rows[0]?.id ?? null;
          const error = !originalId
            ? 'No hay una situación con ese código en tu escuela.'
            : originalId === id
              ? 'Una situación no puede ser duplicado de sí misma.'
              : null;
          if (error)
            throw new BadRequestException({
              mensaje: 'Revisa los datos marcados. No se guardó la decisión.',
              errores: { codigo_original: error },
            });
        }
        return insertarDecision(
          db,
          id,
          { ...datos, fundamento: prefijo + datos.fundamento },
          originalId,
        );
      },
    );
  }

  // PB-045 (HU-038): Convivencia pide información al profesor que registró la
  // situación. En la misma transacción se guarda la pregunta y, si la
  // situación estaba En revisión, se registra la decisión que la pasa a
  // Información solicitada (CA1). La base exige que el destinatario sea el
  // profesor autor y que quien pide sea Convivencia activa (CA2), y que la
  // solicitud no se modifique después (CA3). Si otra persona cambió la
  // situación al mismo tiempo se reintenta una vez con el estado nuevo.
  async pedirAclaracion(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<AclaracionPedida> {
    const pregunta = validarPregunta(cuerpo);
    for (let intento = 1; ; intento++) {
      try {
        return await this.guardarAclaracion(sesion, id, pregunta);
      } catch (error) {
        const reintentar =
          error instanceof ConflictException &&
          error.message === CAMBIO_SIMULTANEO &&
          intento < 2;
        if (!reintentar) throw error;
      }
    }
  }

  private guardarAclaracion(
    sesion: Sesion,
    id: string,
    pregunta: string,
  ): Promise<AclaracionPedida> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const actual = await db
          .query<{
            estado: string;
            profesor: string;
            perfil: string;
            revision_anterior: string | null;
          }>(
            `SELECT s.estado, s.reportado_por_membresia_id AS profesor,
                    m.codigo_perfil AS perfil,
                    (SELECT r.id FROM convi.revisiones_convivencia r
                      WHERE r.situacion_id = s.id
                      ORDER BY r.revisado_en DESC, r.id DESC LIMIT 1) AS revision_anterior
             FROM convi.situaciones s
             JOIN convi.membresias_establecimiento m
               ON m.id = s.reportado_por_membresia_id
             WHERE s.id = $1
             FOR UPDATE OF s`,
            [id],
          )
          .catch((error: unknown) => {
            if (esCambioSimultaneo(error))
              throw new ConflictException(CAMBIO_SIMULTANEO);
            throw error;
          });
        const fila = actual.rows[0];
        if (!fila) throw new NotFoundException(NO_EXISTE);
        // CA2: solo se pregunta al profesor que la registró.
        if (fila.perfil !== 'PROFESOR')
          throw new ConflictException(
            'Esta situación no la registró un profesor: no hay a quién pedirle la aclaración.',
          );
        if (fila.estado === 'NUEVA')
          throw new ConflictException(
            'Inicia la revisión antes de pedir una aclaración.',
          );
        if (!['EN_REVISION', 'INFORMACION_SOLICITADA'].includes(fila.estado))
          throw new ConflictException(
            'La revisión de esta situación ya terminó; no se piden más aclaraciones.',
          );

        // CA1: la decisión pasa la situación a Información solicitada. Se
        // indica la última revisión que se vio; si cambió, la base la rechaza.
        if (fila.estado === 'EN_REVISION') {
          await db.query(
            `INSERT INTO convi.revisiones_convivencia
               (establecimiento_id, situacion_id, tipo_revision, resultado,
                fundamento, revisado_por, revision_anterior_id)
             VALUES (convi.establecimiento_actual(), $1, 'DECISION',
                     'INFORMACION_SOLICITADA', $2, convi.membresia_actual(), $3)`,
            [
              id,
              `Se pidió una aclaración al profesor: ${pregunta}`,
              fila.revision_anterior,
            ],
          );
        }

        const aclaracion = await db.query<
          Omit<AclaracionPedida, 'estado_situacion'>
        >(
          `INSERT INTO convi.aclaraciones_situacion
             (establecimiento_id, situacion_id, solicitado_por,
              profesor_destinatario_id, pregunta)
           VALUES (convi.establecimiento_actual(), $1, convi.membresia_actual(),
                   $2, $3)
           RETURNING id, estado, solicitado_en`,
          [id, fila.profesor, pregunta],
        );
        return {
          ...aclaracion.rows[0],
          estado_situacion: 'INFORMACION_SOLICITADA',
        };
      },
    );
  }

  // PB-043 (HU-036): datos para el formulario de registro de Convivencia.
  opcionesRegistro(sesion: Sesion): Promise<OpcionesRegistro> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const categorias = await db.query<
          OpcionesRegistro['categorias'][number]
        >(
          `SELECT id, nombre FROM convi.categorias_convivencia
           WHERE estado = 'ACTIVO' ORDER BY nombre`,
        );
        const estudiantes = await db.query<
          EstudianteOpcion & { curso_id: string; curso: string }
        >(
          `SELECT e.id, e.persona_id, p.nombres, p.apellidos, e.codigo_estudiante,
                  c.id AS curso_id, c.nombre AS curso
           FROM convi.matriculas m
           JOIN convi.estudiantes e ON e.id = m.estudiante_id
           JOIN convi.personas p ON p.id = e.persona_id
           JOIN convi.cursos c ON c.id = m.curso_id
           JOIN convi.niveles_educativos n ON n.id = c.nivel_id
           WHERE m.estado = 'ACTIVO'
           ORDER BY n.orden, c.seccion NULLS FIRST, c.nombre, p.apellidos, p.nombres`,
        );
        const cursos = new Map<string, OpcionesRegistro['cursos'][number]>();
        for (const { curso_id, curso, ...estudiante } of estudiantes.rows) {
          const grupo = cursos.get(curso_id) ?? {
            id: curso_id,
            nombre: curso,
            estudiantes: [],
          };
          grupo.estudiantes.push(estudiante);
          cursos.set(curso_id, grupo);
        }
        // PB-076 (HU-066): un hecho anterior puede involucrar a un estudiante
        // que hoy no tiene matrícula activa.
        const sinMatricula = await db.query<EstudianteOpcion>(
          `SELECT e.id, e.persona_id, p.nombres, p.apellidos, e.codigo_estudiante
           FROM convi.estudiantes e
           JOIN convi.personas p ON p.id = e.persona_id
           WHERE NOT EXISTS (
             SELECT 1 FROM convi.matriculas m
             WHERE m.estudiante_id = e.id AND m.estado = 'ACTIVO'
           )
           ORDER BY p.apellidos, p.nombres`,
        );
        const funcionarios = await db.query<
          OpcionesRegistro['funcionarios'][number]
        >(
          // PB-144: el selector identifica al informante por ID y nombre, no muestra su perfil.
          `SELECT p.id AS persona_id, p.nombres || ' ' || p.apellidos AS nombre
           FROM convi.membresias_establecimiento m
           JOIN convi.personas p ON p.id = m.persona_id
           WHERE m.estado = 'ACTIVO' AND m.codigo_perfil <> 'APODERADO'
           ORDER BY p.apellidos, p.nombres`,
        );
        const apoderados = await db.query<
          OpcionesRegistro['apoderados'][number]
        >(
          `SELECT DISTINCT p.id AS persona_id,
                  p.nombres || ' ' || p.apellidos AS nombre, p.apellidos, p.nombres
           FROM convi.apoderados_estudiante ae
           JOIN convi.personas p ON p.id = ae.persona_apoderado_id
           WHERE ae.activo_hasta IS NULL OR ae.activo_hasta >= current_date
           ORDER BY p.apellidos, p.nombres`,
        );
        return {
          categorias: categorias.rows,
          cursos: [...cursos.values()],
          sin_matricula: sinMatricula.rows,
          funcionarios: funcionarios.rows,
          apoderados: apoderados.rows.map(({ persona_id, nombre }) => ({
            persona_id,
            nombre,
          })),
        };
      },
    );
  }

  // PB-043 (HU-036): Convivencia registra una situación que llegó por otro
  // canal. Igual que el registro del profesor, todo se guarda en una sola
  // transacción y llega Nueva con su código (CA3); el autor es la cuenta de
  // la sesión y el informante queda aparte (CA2). PB-075 (HU-065): con
  // historico, es una situación de un año anterior que queda marcada como
  // registro histórico y como antecedente con su conclusión.
  registrar(
    sesion: Sesion,
    cuerpo: unknown,
    { historico = false }: { historico?: boolean } = {},
  ): Promise<SituacionRegistrada> {
    const registroHistorico = historico
      ? validarRegistroHistorico(cuerpo)
      : null;
    const datos = registroHistorico ?? validarSituacionConvivencia(cuerpo);
    return conReintentosDeCodigo(() =>
      this.cuentas.operar(
        sesion,
        { tipo: 'establecimiento', perfiles: PERFILES },
        async (db) => {
          const errores: Record<string, string> = {};
          const ocurridoEn = await comprobarFechaYCategoria(db, datos, errores);

          if (datos.curso_id) {
            const curso = await db.query(
              'SELECT 1 FROM convi.cursos WHERE id = $1',
              [datos.curso_id],
            );
            if (curso.rowCount === 0)
              errores.curso_id = 'Elige un curso de la lista.';
          }

          // CA1: el informante debe corresponder al origen indicado. Con
          // origen Otro no hay informante: lo rechaza la validación.
          if (datos.informante_persona_id && datos.tipo_origen !== 'OTRO') {
            const informante = await db.query(
              CONSULTA_INFORMANTE[datos.tipo_origen],
              [datos.informante_persona_id],
            );
            if (informante.rowCount === 0)
              errores.informante_persona_id =
                'La persona elegida no corresponde a ese origen.';
          }

          // PB-076 (HU-066): basta con que el estudiante sea de la escuela,
          // aunque hoy no tenga matrícula activa (retirado o egresado).
          const estudianteIds = datos.participantes.map((p) => p.estudiante_id);
          const estudiantes = await db.query(
            'SELECT 1 FROM convi.estudiantes WHERE id = ANY($1::uuid[])',
            [estudianteIds],
          );
          if (estudiantes.rowCount !== datos.participantes.length)
            errores.participantes = 'Elige estudiantes de la lista.';

          if (!ocurridoEn || Object.keys(errores).length > 0)
            throw errorDeCampos(errores);

          // HU-066 CA1: se guarda la matrícula del día del hecho, si la tenía.
          const alOcurrir = await matriculasAlOcurrir(
            db,
            estudianteIds,
            ocurridoEn,
          );

          const registrada = await insertarSituacion(
            db,
            {
              curso_id: datos.curso_id,
              tipo_origen: datos.tipo_origen,
              persona_origen_id: datos.informante_persona_id,
              ocurrido_en: ocurridoEn,
              lugar: datos.lugar,
              descripcion: datos.descripcion,
              categoria_id: datos.categoria_id,
              urgencia: datos.urgencia,
              registro_historico: historico,
            },
            datos.participantes.map((p) => ({
              rol: p.rol,
              ...alOcurrir.get(p.estudiante_id)!,
            })),
          );
          // PB-075: en la misma transacción queda como antecedente.
          if (registroHistorico) {
            await guardarComoAntecedente(
              db,
              registrada.id,
              registroHistorico.conclusion,
            );
            return { ...registrada, estado: 'ANTECEDENTE' };
          }
          return registrada;
        },
      ),
    );
  }
}
