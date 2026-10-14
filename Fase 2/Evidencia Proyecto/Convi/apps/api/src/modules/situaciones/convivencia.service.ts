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
import { validarPregunta } from './nueva-aclaracion.js';
import {
  errorDeCampos,
  URGENCIAS,
  validarSituacionConvivencia,
} from './nueva-situacion.js';
import {
  comprobarFechaYCategoria,
  conReintentosDeCodigo,
  insertarSituacion,
  type SituacionRegistrada,
} from './registro-situacion.js';

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

/** Lo que necesita el formulario de registro de Convivencia (PB-043). */
export type OpcionesRegistro = {
  categorias: { id: string; nombre: string }[];
  /** Cursos con matrículas activas y sus estudiantes. */
  cursos: {
    id: string;
    nombre: string;
    estudiantes: {
      id: string;
      persona_id: string;
      nombres: string;
      apellidos: string;
      codigo_estudiante: string;
    }[];
  }[];
  /** Personas con una cuenta activa del equipo de la escuela. */
  funcionarios: { persona_id: string; nombre: string; perfil: string }[];
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
          OpcionesRegistro['cursos'][number]['estudiantes'][number] & {
            curso_id: string;
            curso: string;
          }
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
        const funcionarios = await db.query<
          OpcionesRegistro['funcionarios'][number]
        >(
          `SELECT p.id AS persona_id, p.nombres || ' ' || p.apellidos AS nombre,
                  m.codigo_perfil AS perfil
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
  // la sesión y el informante queda aparte (CA2).
  registrar(sesion: Sesion, cuerpo: unknown): Promise<SituacionRegistrada> {
    const datos = validarSituacionConvivencia(cuerpo);
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

          // HU-035 CA4: la matrícula activa de cada estudiante, de cualquier curso.
          const matriculas = await db.query<{
            estudiante_id: string;
            persona_id: string;
            matricula_id: string;
          }>(
            `SELECT e.id AS estudiante_id, e.persona_id, m.id AS matricula_id
             FROM convi.matriculas m
             JOIN convi.estudiantes e ON e.id = m.estudiante_id
             WHERE m.estado = 'ACTIVO' AND e.id = ANY($1::uuid[])`,
            [datos.participantes.map((p) => p.estudiante_id)],
          );
          const matriculaDe = new Map(
            matriculas.rows.map((fila) => [fila.estudiante_id, fila]),
          );
          if (matriculaDe.size !== datos.participantes.length)
            errores.participantes =
              'Hay estudiantes sin una matrícula activa en la escuela.';

          if (!ocurridoEn || Object.keys(errores).length > 0)
            throw errorDeCampos(errores);

          return insertarSituacion(
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
            },
            datos.participantes.map((p) => ({
              rol: p.rol,
              ...matriculaDe.get(p.estudiante_id)!,
            })),
          );
        },
      ),
    );
  }
}
