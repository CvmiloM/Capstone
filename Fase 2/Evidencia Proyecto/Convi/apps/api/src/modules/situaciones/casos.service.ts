import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  casosRelacionados,
  HOY_ESCUELA,
  validarNuevoCaso,
  type NuevoCaso,
} from './caso-nuevo.js';
import { ultimaRevision } from './decision-situacion.js';
import { validarVinculacion } from './vinculacion-caso.js';

// PB-053 (HU-046): casos de convivencia. Solo Convivencia los abre y los ve;
// la seguridad por fila separa por escuela y CuentaService.operar exige el
// segundo factor. PB-052 (HU-045): una situación también se suma a un caso
// existente. Los cambios de estado y el cierre vienen en PB-152 y PB-054.
const PERFILES: Perfil[] = ['CONVIVENCIA'];

/** Tope de filas de la lista de casos. */
export const MAXIMO_CASOS = 200;

const NO_EXISTE = 'El caso no existe.';
const NO_EXISTE_SITUACION = 'La situación no existe.';
const DECISION_DESACTUALIZADA =
  'Otra persona registró una revisión o una decisión mientras mirabas la situación. Recarga la página para verla antes de continuar.';
const CASO_SIMULTANEO =
  'Se abrió otro caso al mismo tiempo. Envía el formulario nuevamente.';
const INTENTOS_CASO = 5;

export type CasoLista = {
  id: string;
  codigo: string;
  titulo: string;
  estado_actual: string;
  fecha_inicio: string;
  fecha_limite_cierre: string | null;
  categoria: string | null;
  responsable: string;
  situaciones: number;
  estudiantes: number;
};

export type DetalleCaso = CasoLista & {
  resumen: string;
  abierto_por: string;
  abierto_en: Date;
  plazo_cierre_dias_aplicado: number | null;
  justificacion_independiente: string | null;
  registro_historico: boolean;
  participantes: {
    estudiante_id: string | null;
    nombres: string;
    apellidos: string;
    codigo_estudiante: string | null;
    rol: string;
    /** Curso y año de la matrícula guardada al pasar al caso (HU-066). */
    curso_matricula: string | null;
  }[];
  situaciones_vinculadas: {
    id: string;
    codigo: string;
    categoria: string | null;
    ocurrido_en: Date;
    vinculado_a_caso_en: Date;
    /** HU-045 CA2: quién la vinculó y con qué fundamento. */
    vinculado_por: string;
    fundamento_vinculacion: string | null;
  }[];
};

// 40001: otra transacción cambió la fila bloqueada; 23505 en el código: otro
// caso tomó el mismo número correlativo al mismo tiempo (como en PB-042).
function esChoque(error: unknown) {
  const { code, constraint } = (error ?? {}) as {
    code?: string;
    constraint?: string;
  };
  return (
    code === '40001' ||
    (code === '23505' && constraint === 'casos_establecimiento_id_codigo_key')
  );
}

const COLUMNAS_LISTA = `
  c.id, c.codigo, c.titulo, c.estado_actual, c.fecha_inicio::text AS fecha_inicio,
  c.fecha_limite_cierre::text AS fecha_limite_cierre,
  cat.nombre AS categoria, pr.nombres || ' ' || pr.apellidos AS responsable,
  (SELECT count(*) FROM convi.situaciones s WHERE s.caso_id = c.id)::int AS situaciones,
  (SELECT count(*) FROM convi.participaciones pa
    JOIN convi.estudiantes e ON e.persona_id = pa.persona_id
    WHERE pa.caso_id = c.id AND pa.activo_hasta IS NULL)::int AS estudiantes`;

const DESDE_LISTA = `
  FROM convi.casos c
  JOIN convi.membresias_establecimiento mr ON mr.id = c.asignado_a_membresia_id
  JOIN convi.personas pr ON pr.id = mr.persona_id
  LEFT JOIN convi.categorias_convivencia cat ON cat.id = c.categoria_principal_id`;

@Injectable()
export class CasosService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Los casos abiertos primero (no cerrados), luego por fecha de inicio.
  listar(sesion: Sesion): Promise<{ casos: CasoLista[]; limite: number }> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const casos = await db.query<CasoLista>(
          `SELECT ${COLUMNAS_LISTA}
           ${DESDE_LISTA}
           ORDER BY c.estado_actual = 'CERRADO', c.fecha_inicio DESC, c.codigo DESC
           LIMIT $1`,
          [MAXIMO_CASOS],
        );
        return { casos: casos.rows, limite: MAXIMO_CASOS };
      },
    );
  }

  detalle(sesion: Sesion, id: string): Promise<DetalleCaso> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const base = await db.query<
          Omit<DetalleCaso, 'participantes' | 'situaciones_vinculadas'>
        >(
          `SELECT ${COLUMNAS_LISTA}, c.resumen, c.abierto_en,
                  pa.nombres || ' ' || pa.apellidos AS abierto_por,
                  c.plazo_cierre_dias_aplicado, c.justificacion_independiente,
                  c.registro_historico
           ${DESDE_LISTA}
           JOIN convi.membresias_establecimiento ma ON ma.id = c.abierto_por
           JOIN convi.personas pa ON pa.id = ma.persona_id
           WHERE c.id = $1`,
          [id],
        );
        const caso = base.rows[0];
        if (!caso) throw new NotFoundException(NO_EXISTE);
        const participantes = await db.query<
          DetalleCaso['participantes'][number]
        >(
          `SELECT e.id AS estudiante_id, p.nombres, p.apellidos,
                  e.codigo_estudiante, pa.rol_contextual AS rol,
                  cm.nombre || ' (' || am.anio || ')' AS curso_matricula
           FROM convi.participaciones pa
           JOIN convi.personas p ON p.id = pa.persona_id
           LEFT JOIN convi.estudiantes e ON e.persona_id = p.id
           LEFT JOIN convi.matriculas mt ON mt.id = pa.matricula_contexto_id
           LEFT JOIN convi.cursos cm ON cm.id = mt.curso_id
           LEFT JOIN convi.anios_academicos am ON am.id = cm.anio_academico_id
           WHERE pa.caso_id = $1 AND pa.activo_hasta IS NULL
           ORDER BY p.apellidos, p.nombres`,
          [id],
        );
        const situaciones = await db.query<
          DetalleCaso['situaciones_vinculadas'][number]
        >(
          `SELECT s.id, s.codigo, cat.nombre AS categoria, s.ocurrido_en,
                  s.vinculado_a_caso_en,
                  pv.nombres || ' ' || pv.apellidos AS vinculado_por,
                  (SELECT r.fundamento FROM convi.revisiones_convivencia r
                   WHERE r.situacion_id = s.id AND r.resultado = 'VINCULADA_CASO'
                     AND r.caso_destino_id = s.caso_id
                   ORDER BY r.revisado_en DESC LIMIT 1) AS fundamento_vinculacion
           FROM convi.situaciones s
           LEFT JOIN convi.categorias_convivencia cat ON cat.id = s.categoria_id
           JOIN convi.membresias_establecimiento mv ON mv.id = s.vinculado_a_caso_por
           JOIN convi.personas pv ON pv.id = mv.persona_id
           WHERE s.caso_id = $1
           ORDER BY s.ocurrido_en, s.codigo`,
          [id],
        );
        return {
          ...caso,
          participantes: participantes.rows,
          situaciones_vinculadas: situaciones.rows,
        };
      },
    );
  }

  // HU-046: abre el caso desde una situación En revisión. En una sola
  // transacción se crea el caso En análisis con su código (CA2), sus
  // participantes pasan al caso y se registra la decisión que deja la
  // situación vinculada. Si otro caso tomó el mismo código se reintenta.
  async crearDesdeSituacion(
    sesion: Sesion,
    situacionId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; codigo: string }> {
    const datos = validarNuevoCaso(cuerpo);
    for (let intento = 1; ; intento++) {
      try {
        return await this.guardarCaso(sesion, situacionId, datos);
      } catch (error) {
        const reintentar =
          error instanceof ConflictException &&
          error.message === CASO_SIMULTANEO &&
          intento < INTENTOS_CASO;
        if (!reintentar) throw error;
        await new Promise((listo) =>
          setTimeout(listo, 20 + Math.random() * 80),
        );
      }
    }
  }

  private guardarCaso(
    sesion: Sesion,
    situacionId: string,
    datos: NuevoCaso,
  ): Promise<{ id: string; codigo: string }> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        await situacionEnRevision(
          db,
          situacionId,
          datos.revision_anterior_id,
          'abrir un caso',
        );

        const errores: Record<string, string> = {};
        // CA1: el responsable es una cuenta de Convivencia activa de la escuela.
        const responsable = await db.query(
          `SELECT 1 FROM convi.membresias_establecimiento
           WHERE id = $1 AND codigo_perfil = 'CONVIVENCIA' AND estado = 'ACTIVO'`,
          [datos.responsable_id],
        );
        if (responsable.rowCount === 0)
          errores.responsable_id =
            'Elige a una persona activa del equipo de Convivencia.';
        if (datos.categoria_principal_id) {
          const categoria = await db.query(
            `SELECT 1 FROM convi.categorias_convivencia
             WHERE id = $1 AND estado = 'ACTIVO'`,
            [datos.categoria_principal_id],
          );
          if (categoria.rowCount === 0)
            errores.categoria_principal_id = 'Elige una categoría activa.';
        }
        const futura = await db.query<{ futura: boolean }>(
          `SELECT $1::date > ${HOY_ESCUELA} AS futura`,
          [datos.fecha_inicio],
        );
        if (futura.rows[0]?.futura)
          errores.fecha_inicio = 'La fecha de inicio no puede ser futura.';
        // CA4: con un caso activo de los mismos estudiantes hay que justificar
        // por qué se abre uno independiente (la otra opción es vincularla, PB-052).
        const relacionados = await casosRelacionados(db, situacionId);
        if (relacionados.length > 0 && !datos.justificacion_independiente)
          errores.justificacion_independiente = `Ya hay casos activos con estos estudiantes (${relacionados
            .map((c) => c.codigo)
            .join(', ')}). Explica por qué abres uno independiente.`;
        if (Object.keys(errores).length > 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se abrió el caso.',
            errores,
          });

        // CA2 y CA5: la base asigna el código, el estado En análisis, la fecha
        // de registro y copia el plazo de cierre de la escuela (CA3).
        const caso = await db
          .query<{ id: string; codigo: string }>(
            `INSERT INTO convi.casos
               (establecimiento_id, titulo, resumen, fecha_inicio,
                categoria_principal_id, asignado_a_membresia_id, abierto_por,
                justificacion_independiente)
             VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5,
                     convi.membresia_actual(), $6)
             RETURNING id, codigo`,
            [
              datos.titulo,
              datos.resumen,
              datos.fecha_inicio,
              datos.categoria_principal_id,
              datos.responsable_id,
              relacionados.length > 0
                ? datos.justificacion_independiente
                : null,
            ],
          )
          .catch((error: unknown) => {
            if (esChoque(error)) throw new ConflictException(CASO_SIMULTANEO);
            throw error;
          });
        const nuevo = caso.rows[0];

        // CA2: los participantes de la situación pasan al caso, con la
        // matrícula que tenían al ocurrir el hecho (HU-066).
        await db.query(
          `INSERT INTO convi.participaciones
             (establecimiento_id, persona_id, caso_id, rol_contextual,
              matricula_contexto_id)
           SELECT convi.establecimiento_actual(), pa.persona_id, $1,
                  pa.rol_contextual, pa.matricula_contexto_id
           FROM convi.participaciones pa
           WHERE pa.situacion_id = $2 AND pa.activo_hasta IS NULL`,
          [nuevo.id, situacionId],
        );

        // La decisión deja la situación Vinculada a caso; la base exige que
        // el caso comparta un estudiante con ella y la última revisión vista.
        await db.query(
          `INSERT INTO convi.revisiones_convivencia
             (establecimiento_id, situacion_id, tipo_revision, resultado,
              fundamento, revisado_por, revision_anterior_id, caso_destino_id)
           VALUES (convi.establecimiento_actual(), $1, 'DECISION',
                   'VINCULADA_CASO', $2, convi.membresia_actual(), $3, $4)`,
          [
            situacionId,
            `Se abrió el caso ${nuevo.codigo} a partir de esta situación: ${datos.titulo}`,
            datos.revision_anterior_id,
            nuevo.id,
          ],
        );
        return nuevo;
      },
    );
  }

  // HU-045: suma la situación En revisión a un caso activo que comparte
  // estudiantes con ella. La decisión Vinculada a caso deja en la situación el
  // caso, quién y cuándo (CA2); después no se traslada ni se desvincula (CA4).
  // Responde con el id y el código del caso.
  vincularSituacion(
    sesion: Sesion,
    situacionId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; codigo: string }> {
    const datos = validarVinculacion(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        await situacionEnRevision(
          db,
          situacionId,
          datos.revision_anterior_id,
          'vincularla a un caso',
        );

        // FOR SHARE impide que el caso se cierre mientras se vincula.
        const caso = await db
          .query<{ id: string; codigo: string }>(
            'SELECT id, codigo FROM convi.casos WHERE id = $1 FOR SHARE',
            [datos.caso_id],
          )
          .catch((error: unknown) => {
            if (esChoque(error))
              throw new ConflictException(
                'El caso cambió mientras lo elegías. Recarga la página e inténtalo nuevamente.',
              );
            throw error;
          });
        // CA1: solo un caso de la escuela que comparte un estudiante con la
        // situación. Decisión del PO (por defecto): un caso cerrado no recibe
        // situaciones nuevas, igual que en la lista de casos relacionados.
        const permitidos = await casosRelacionados(db, situacionId);
        const elegido = caso.rows[0];
        if (!elegido || !permitidos.some((c) => c.id === elegido.id))
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se vinculó la situación.',
            errores: {
              caso_id:
                'Elige uno de los casos activos que comparten estudiantes con esta situación.',
            },
          });

        // Primero la decisión, para que la base compruebe el estudiante en
        // común con lo que el caso ya tenía; el trigger aplicar_revision deja
        // la situación Vinculada a caso con quién y cuándo.
        await db.query(
          `INSERT INTO convi.revisiones_convivencia
             (establecimiento_id, situacion_id, tipo_revision, resultado,
              fundamento, revisado_por, revision_anterior_id, caso_destino_id)
           VALUES (convi.establecimiento_actual(), $1, 'DECISION',
                   'VINCULADA_CASO', $2, convi.membresia_actual(), $3, $4)`,
          [
            situacionId,
            datos.fundamento,
            datos.revision_anterior_id,
            elegido.id,
          ],
        );

        // Decisión del PO (por defecto): quienes participan en la situación y
        // no estaban en el caso pasan a él con la matrícula que tenían al
        // ocurrir el hecho (HU-066); quienes ya estaban conservan su rol.
        await db.query(
          `INSERT INTO convi.participaciones
             (establecimiento_id, persona_id, caso_id, rol_contextual,
              matricula_contexto_id)
           SELECT convi.establecimiento_actual(), pa.persona_id, $1,
                  pa.rol_contextual, pa.matricula_contexto_id
           FROM convi.participaciones pa
           WHERE pa.situacion_id = $2 AND pa.activo_hasta IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM convi.participaciones pc
               WHERE pc.caso_id = $1 AND pc.persona_id = pa.persona_id
                 AND pc.activo_hasta IS NULL)`,
          [elegido.id, situacionId],
        );
        return elegido;
      },
    );
  }
}

/**
 * Bloquea la situación y comprueba que siga En revisión y que nadie haya
 * agregado una revisión desde que se abrió el formulario (PB-139). Abrir un
 * caso y vincularla a uno existente son decisiones que terminan la revisión.
 */
async function situacionEnRevision(
  db: PoolClient,
  situacionId: string,
  revisionAnteriorId: string | null,
  para: string,
) {
  const actual = await db
    .query<{ estado: string }>(
      'SELECT estado FROM convi.situaciones WHERE id = $1 FOR UPDATE',
      [situacionId],
    )
    .catch((error: unknown) => {
      if (esChoque(error)) throw new ConflictException(DECISION_DESACTUALIZADA);
      throw error;
    });
  const fila = actual.rows[0];
  if (!fila) throw new NotFoundException(NO_EXISTE_SITUACION);
  if (fila.estado === 'NUEVA')
    throw new ConflictException(`Inicia la revisión antes de ${para}.`);
  if (fila.estado === 'INFORMACION_SOLICITADA')
    throw new ConflictException(
      `Espera la respuesta del profesor a la aclaración antes de ${para}.`,
    );
  // HU-045 CA4: una situación vinculada no se traslada ni se desvincula.
  if (fila.estado === 'VINCULADA_CASO')
    throw new ConflictException(
      'Esta situación ya está vinculada a un caso. No se traslada a otro ni se desvincula.',
    );
  if (fila.estado !== 'EN_REVISION')
    throw new ConflictException(
      'Esta situación ya tiene una decisión. Para cambiarla hay que reconsiderarla.',
    );
  if ((await ultimaRevision(db, situacionId)) !== revisionAnteriorId)
    throw new ConflictException(DECISION_DESACTUALIZADA);
}
