import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  leerFiltrosAlertas,
  POR_PAGINA_ALERTAS,
  validarRevisionAlerta,
} from './atencion.js';

// PB-093 (HU-080): bandeja, detalle y revisión de las alertas que genera el
// motor de reglas (PB-090 a PB-092). Solo Convivencia activa con segundo
// factor (PB-009); la seguridad por fila separa por escuela y todo el equipo
// de Convivencia ve todas las alertas de su escuela (por defecto).
const PERFILES: Perfil[] = ['CONVIVENCIA'];

const NO_EXISTE = 'La alerta no existe.';
const YA_REVISADA =
  'La alerta ya fue revisada o archivada. Su revisión se conserva y no se cambia.';
// PB-139: el formulario envía la huella de lo que se veía.
const DESACTUALIZADA =
  'Otra persona cambió la alerta mientras la mirabas. Recarga la página para verla antes de continuar.';

/** Situaciones de origen que se muestran en el detalle; el resto se cuenta. */
const SITUACIONES_EN_DETALLE = 50;

/** Alta primero; dentro de cada prioridad, las más recientes (por defecto). */
const ORDEN_PRIORIDAD = `array_position(ARRAY['ALTA','MEDIA','BAJA']::text[], r.codigo_prioridad::text)`;

/** A qué se refiere la alerta según el ámbito de su regla; null es la escuela. */
const REFERENCIA = `CASE r.codigo_ambito
    WHEN 'ESTUDIANTE' THEN pe.nombres || ' ' || pe.apellidos
    WHEN 'CURSO' THEN cu.nombre
    WHEN 'CASO' THEN ca.codigo || ', ' || ca.titulo
  END`;

const DESDE_ALERTA = `
  FROM convi.alertas a
  JOIN convi.reglas r ON r.id = a.regla_id
  LEFT JOIN convi.estudiantes es ON es.id = a.estudiante_id
  LEFT JOIN convi.personas pe ON pe.id = es.persona_id
  LEFT JOIN convi.cursos cu ON cu.id = a.curso_id
  LEFT JOIN convi.casos ca ON ca.id = a.caso_id`;

export type AlertaLista = {
  id: string;
  estado: string;
  generada_en: string;
  revisado_en: string | null;
  codigo_regla: string;
  numero_version: number;
  regla: string;
  prioridad: string;
  tipo_regla: string;
  ambito: string;
  referencia: string | null;
  formula: string | null;
};

type PaginaAlertas = {
  alertas: AlertaLista[];
  total: number;
  pagina: number;
  limite: number;
  /** Cuántas alertas hay en cada estado, para las pestañas de la bandeja. */
  conteo: Record<string, number>;
  /** Zona horaria de la escuela, para mostrar las fechas sin otra consulta. */
  zona_horaria: string;
};

type DetalleAlerta = AlertaLista & {
  observacion: string | null;
  revisado_por: string | null;
  categoria: string | null;
  /** Lo que guardó el motor (HU-079 CA3): fórmula, período, conteo y umbral. */
  explicacion: Record<string, unknown>;
  version: string;
  /** Zona horaria de la escuela, para mostrar las fechas sin otra consulta. */
  zona_horaria: string;
  estudiante: { id: string; nombre: string; codigo: string } | null;
  curso: { id: string; nombre: string } | null;
  caso: { id: string; codigo: string; titulo: string } | null;
  total_situaciones: number;
  situaciones: {
    id: string;
    codigo: string;
    ocurrido_en: string;
    categoria: string | null;
    estado: string;
  }[];
  vencidos: {
    tipo: string;
    id: string;
    descripcion: string | null;
    vence_en: string | null;
    seguimiento: boolean;
  }[];
};

@Injectable()
export class AtencionAlertasService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Bandeja: Nuevas al entrar, o Revisadas, Archivadas o todas.
  listar(
    sesion: Sesion,
    consulta: Record<string, unknown> = {},
  ): Promise<PaginaAlertas> {
    const filtros = leerFiltrosAlertas(consulta);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<PaginaAlertas>(
          `WITH filtradas AS MATERIALIZED (
             SELECT a.id, a.generada_en, ${ORDEN_PRIORIDAD} AS orden
             FROM convi.alertas a JOIN convi.reglas r ON r.id = a.regla_id
             WHERE $1::text IS NULL OR a.estado = $1
           ), cuenta AS (
             SELECT count(*)::int AS total,
               least($2::int, greatest(1, ceil(count(*)::numeric / $3)::int)) AS pagina
             FROM filtradas
           ), elegidas AS MATERIALIZED (
             SELECT f.id, f.orden FROM filtradas f
             ORDER BY f.orden, f.generada_en DESC, f.id DESC
             LIMIT $3 OFFSET (SELECT (pagina - 1) * $3 FROM cuenta)
           )
           SELECT cuenta.total, cuenta.pagina, $3::int AS limite,
             current_setting('TimeZone') AS zona_horaria,
             (SELECT coalesce(jsonb_agg(to_jsonb(fila) - 'orden'
                ORDER BY fila.orden, fila.generada_en DESC, fila.id DESC), '[]'::jsonb)
              FROM (SELECT e.orden, a.id, a.estado, a.generada_en, a.revisado_en,
                      r.codigo_regla, r.numero_version, r.nombre AS regla,
                      r.codigo_prioridad AS prioridad, r.tipo_regla, r.codigo_ambito AS ambito,
                      ${REFERENCIA} AS referencia,
                      a.datos_explicacion->>'formula' AS formula
                    ${DESDE_ALERTA} JOIN elegidas e ON e.id = a.id) fila) AS alertas,
             (SELECT coalesce(jsonb_object_agg(estado, total), '{}'::jsonb)
              FROM (SELECT estado, count(*)::int AS total FROM convi.alertas GROUP BY estado) c
             ) AS conteo
           FROM cuenta`,
          [filtros.estado, filtros.pagina, POR_PAGINA_ALERTAS],
        );
        return resultado.rows[0];
      },
    );
  }

  // CA1: la regla, el cálculo guardado, el registro al que se refiere y las
  // situaciones que la originaron (o los vencidos del caso), en una consulta.
  detalle(sesion: Sesion, id: string): Promise<DetalleAlerta> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<DetalleAlerta>(
          `SELECT a.id, a.estado, a.generada_en, a.revisado_en,
             current_setting('TimeZone') AS zona_horaria,
             a.observacion_revision AS observacion,
             CASE WHEN a.revisado_por IS NOT NULL THEN prv.nombres || ' ' || prv.apellidos END AS revisado_por,
             r.codigo_regla, r.numero_version, r.nombre AS regla,
             r.codigo_prioridad AS prioridad, r.tipo_regla, r.codigo_ambito AS ambito,
             cat.nombre AS categoria, ${REFERENCIA} AS referencia,
             a.datos_explicacion->>'formula' AS formula,
             a.datos_explicacion AS explicacion, md5(to_jsonb(a)::text) AS version,
             CASE WHEN es.id IS NOT NULL THEN jsonb_build_object(
               'id', es.id, 'nombre', pe.nombres || ' ' || pe.apellidos, 'codigo', es.codigo_estudiante) END AS estudiante,
             CASE WHEN cu.id IS NOT NULL THEN jsonb_build_object('id', cu.id, 'nombre', cu.nombre) END AS curso,
             CASE WHEN ca.id IS NOT NULL THEN jsonb_build_object(
               'id', ca.id, 'codigo', ca.codigo, 'titulo', ca.titulo) END AS caso,
             coalesce(si.total, 0) AS total_situaciones,
             coalesce(si.lista, '[]'::jsonb) AS situaciones,
             coalesce(ve.lista, '[]'::jsonb) AS vencidos
           ${DESDE_ALERTA}
           LEFT JOIN convi.categorias_convivencia cat ON cat.id = r.categoria_id
           LEFT JOIN convi.membresias_establecimiento mrv ON mrv.id = a.revisado_por
           LEFT JOIN convi.personas prv ON prv.id = mrv.persona_id
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS total,
               jsonb_agg(jsonb_build_object('id', x.id, 'codigo', x.codigo,
                 'ocurrido_en', x.ocurrido_en, 'categoria', x.categoria, 'estado', x.estado)
                 ORDER BY x.n) FILTER (WHERE x.n <= $2) AS lista
             FROM (SELECT s.id, s.codigo, s.ocurrido_en, s.estado, cs.nombre AS categoria,
                     row_number() OVER (ORDER BY s.ocurrido_en DESC, s.id) AS n
                   FROM convi.situaciones_alerta sa
                   JOIN convi.situaciones s ON s.id = sa.situacion_id
                   LEFT JOIN convi.categorias_convivencia cs ON cs.id = s.categoria_id
                   WHERE sa.alerta_id = a.id) x
           ) si ON true
           LEFT JOIN LATERAL (
             SELECT jsonb_agg(jsonb_build_object('tipo', v.dato->>'tipo', 'id', v.dato->>'id',
                 'descripcion', coalesce(co.descripcion, ap.descripcion, ac.objetivo, pp.nombre),
                 'vence_en', coalesce(co.vence_en, ap.vence_en, ac.programado_en, ep.vence_en),
                 'seguimiento', coalesce(ac.tipo_actuacion = 'SEGUIMIENTO', false))
                 ORDER BY v.orden) AS lista
             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.datos_explicacion->'vencidos') = 'array'
                    THEN a.datos_explicacion->'vencidos' ELSE '[]'::jsonb END)
                  WITH ORDINALITY AS v(dato, orden)
             LEFT JOIN convi.compromisos co
               ON v.dato->>'tipo' = 'compromisos' AND co.id::text = v.dato->>'id'
             LEFT JOIN convi.acciones_plan_intervencion ap
               ON v.dato->>'tipo' = 'acciones_plan_intervencion' AND ap.id::text = v.dato->>'id'
             LEFT JOIN convi.actuaciones ac
               ON v.dato->>'tipo' = 'actuaciones' AND ac.id::text = v.dato->>'id'
             LEFT JOIN convi.estados_pasos_protocolo_caso ep
               ON v.dato->>'tipo' = 'estados_pasos_protocolo_caso' AND ep.id::text = v.dato->>'id'
             LEFT JOIN convi.pasos_protocolo pp ON pp.id = ep.paso_protocolo_id
           ) ve ON true
           WHERE a.id = $1`,
          [id, SITUACIONES_EN_DETALLE],
        );
        if (!resultado.rows[0]) throw new NotFoundException(NO_EXISTE);
        return resultado.rows[0];
      },
    );
  }

  // CA2 y CA3: marca la alerta Revisada o Archivada con lo que se hizo. Pasa
  // una sola vez desde Nueva (por defecto); la alerta y su explicación no
  // cambian, la base guarda quién y cuándo y la auditoría registra el cambio.
  revisar(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarRevisionAlerta(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const actual = await db.query<{ estado: string; version: string }>(
          `SELECT a.estado, md5(to_jsonb(a)::text) AS version
           FROM convi.alertas a WHERE a.id = $1 FOR UPDATE`,
          [id],
        );
        if (!actual.rows[0]) throw new NotFoundException(NO_EXISTE);
        if (actual.rows[0].estado !== 'NUEVA')
          throw new ConflictException(YA_REVISADA);
        if (actual.rows[0].version !== datos.version)
          throw new ConflictException(DESACTUALIZADA);
        await db.query(
          `UPDATE convi.alertas
           SET estado = $2, observacion_revision = $3,
               revisado_por = convi.membresia_actual(), revisado_en = now()
           WHERE id = $1`,
          [id, datos.estado_nuevo, datos.observacion],
        );
        return { id };
      },
      'READ COMMITTED',
    );
  }
}
