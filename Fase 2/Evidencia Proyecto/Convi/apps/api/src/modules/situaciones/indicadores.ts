import { BadRequestException } from '@nestjs/common';

export type FiltrosIndicadores = {
  desde: string | null;
  hasta: string | null;
  curso: string | null;
  categoria: string | null;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validarFiltrosIndicadores(
  datos: Record<string, unknown>,
): FiltrosIndicadores {
  const fecha = (valor: unknown) => {
    if (valor === undefined || valor === '') return null;
    if (
      typeof valor !== 'string' ||
      !FECHA.test(valor) ||
      !Number.isFinite(Date.parse(`${valor}T00:00:00Z`)) ||
      new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) !== valor
    )
      throw new BadRequestException('Revisa las fechas del período');
    return valor;
  };
  const id = (valor: unknown) => {
    if (valor === undefined || valor === '') return null;
    if (typeof valor !== 'string' || !UUID.test(valor))
      throw new BadRequestException('Revisa el curso o la categoría');
    return valor;
  };
  const desde = fecha(datos.desde);
  const hasta = fecha(datos.hasta);
  if (
    (desde && !hasta) ||
    (!desde && hasta) ||
    (desde &&
      hasta &&
      (desde > hasta ||
        (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) /
          86400000 >
          366))
  )
    throw new BadRequestException('Elige un período válido de hasta 367 días');
  return {
    desde,
    hasta,
    curso: id(datos.curso),
    categoria: id(datos.categoria),
  };
}

export const OPCIONES_INDICADORES = `SELECT jsonb_build_object(
    'categorias',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nombre',nombre) ORDER BY nombre)
      FROM convi.categorias_convivencia WHERE estado='ACTIVO'),'[]'::jsonb),
    'cursos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre || ' · ' || a.anio::text)
      ORDER BY a.anio DESC,c.nombre)
      FROM convi.cursos c JOIN convi.anios_academicos a ON a.id=c.anio_academico_id),'[]'::jsonb)) AS opciones`;

// Una situación se cuenta una vez, aunque tenga varios participantes
// current_date y las conversiones de timestamptz usan la zona de la escuela
export const CONSULTA_INDICADORES = `
WITH parametros AS (
  SELECT coalesce($1::date,date_trunc('year',current_date)::date) desde,
         coalesce($2::date,current_date) hasta,
         $3::uuid curso, $4::uuid categoria, $5::uuid estudiante, $6::uuid caso, $7::uuid nivel
), anterior AS (
  SELECT desde - (hasta - desde + 1) desde, desde - 1 hasta FROM parametros
), alumno AS (
  SELECT persona_id FROM convi.estudiantes WHERE id=$5::uuid
), situaciones_ambito AS NOT MATERIALIZED (
  SELECT s.* FROM convi.situaciones s
  WHERE ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM convi.participaciones pa, alumno a
    WHERE pa.persona_id=a.persona_id AND pa.situacion_id=s.id AND pa.activo_hasta IS NULL))
    AND ($6::uuid IS NULL OR s.caso_id=$6::uuid)
    AND ($7::uuid IS NULL OR EXISTS (SELECT 1 FROM convi.cursos c WHERE c.id=s.curso_contexto_id AND c.nivel_id=$7::uuid))
), hechos AS MATERIALIZED (
  SELECT s.id, s.ocurrido_en::date fecha, s.categoria_id, s.curso_contexto_id,
         nullif(trim(s.lugar),'') lugar
  FROM situaciones_ambito s, parametros p
  WHERE s.ocurrido_en >= p.desde::timestamptz
    AND s.ocurrido_en < (p.hasta + 1)::timestamptz
    AND (p.curso IS NULL OR s.curso_contexto_id=p.curso)
    AND (p.categoria IS NULL OR s.categoria_id=p.categoria)
), casos_filtrados AS NOT MATERIALIZED (
  SELECT c.id, c.estado_actual, c.abierto_en, c.cerrado_en, c.fecha_limite_cierre
  FROM convi.casos c
  WHERE ($6::uuid IS NULL OR c.id=$6::uuid)
    AND ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM situaciones_ambito s WHERE s.caso_id=c.id)
      OR EXISTS (SELECT 1 FROM convi.participaciones pa, alumno a
        WHERE pa.caso_id=c.id AND pa.persona_id=a.persona_id AND pa.activo_hasta IS NULL))
    AND ($7::uuid IS NULL OR EXISTS (SELECT 1 FROM situaciones_ambito s WHERE s.caso_id=c.id))
    AND ($3::uuid IS NULL OR EXISTS (
      SELECT 1 FROM convi.situaciones s WHERE s.caso_id=c.id AND s.curso_contexto_id=$3::uuid))
    AND ($4::uuid IS NULL OR EXISTS (
      SELECT 1 FROM convi.situaciones s WHERE s.caso_id=c.id AND s.categoria_id=$4::uuid))
), compromisos AS MATERIALIZED (
  SELECT c.estado, c.vence_en, c.completado_en
  FROM convi.compromisos c, parametros p
  WHERE c.vence_en >= p.desde::timestamptz
    AND c.vence_en < (p.hasta + 1)::timestamptz
    AND c.caso_id IN (SELECT id FROM casos_filtrados)
    AND ($3::uuid IS NULL OR EXISTS (
      SELECT 1 FROM convi.situaciones s WHERE s.caso_id=c.caso_id AND s.curso_contexto_id=$3::uuid))
    AND ($4::uuid IS NULL OR EXISTS (
      SELECT 1 FROM convi.situaciones s WHERE s.caso_id=c.caso_id AND s.categoria_id=$4::uuid))
), seguimientos AS MATERIALIZED (
  SELECT a.estado, a.programado_en, a.realizado_en
  FROM convi.actuaciones a, parametros p
  WHERE a.tipo_actuacion='SEGUIMIENTO' AND a.programado_en >= p.desde::timestamptz
    AND a.programado_en < (p.hasta + 1)::timestamptz
    AND a.caso_id IN (SELECT id FROM casos_filtrados)
    AND ($3::uuid IS NULL OR EXISTS (
      SELECT 1 FROM convi.situaciones s WHERE s.caso_id=a.caso_id AND s.curso_contexto_id=$3::uuid))
    AND ($4::uuid IS NULL OR EXISTS (
      SELECT 1 FROM convi.situaciones s WHERE s.caso_id=a.caso_id AND s.categoria_id=$4::uuid))
), cierres AS MATERIALIZED (
  SELECT c.* FROM casos_filtrados c, parametros p
  WHERE c.estado_actual='CERRADO' AND c.cerrado_en >= p.desde::timestamptz
    AND c.cerrado_en < (p.hasta + 1)::timestamptz
), movimientos AS MATERIALIZED (
  SELECT h.caso_id, h.estado_nuevo, h.cambiado_en >= p.desde::timestamptz actual
  FROM convi.historial_estados_caso h
  JOIN casos_filtrados c ON c.id=h.caso_id
  CROSS JOIN parametros p CROSS JOIN anterior a
  WHERE h.estado_nuevo IN ('CERRADO','REABIERTO')
    AND h.cambiado_en >= a.desde::timestamptz
    AND h.cambiado_en < (p.hasta + 1)::timestamptz
), comparables AS (
  SELECT 1 orden, 'Situaciones' indicador, (SELECT count(*)::int FROM hechos) actual,
    (SELECT count(*)::int FROM situaciones_ambito s, anterior a, parametros p
     WHERE s.ocurrido_en >= a.desde::timestamptz AND s.ocurrido_en < (a.hasta + 1)::timestamptz
       AND (p.curso IS NULL OR s.curso_contexto_id=p.curso)
       AND (p.categoria IS NULL OR s.categoria_id=p.categoria)) anterior
  UNION ALL
  SELECT 2, 'Cierres', count(*) FILTER (WHERE actual)::int, count(*) FILTER (WHERE NOT actual)::int
  FROM movimientos WHERE estado_nuevo='CERRADO'
  UNION ALL
  SELECT 3, 'Reaperturas', count(*) FILTER (WHERE actual)::int, count(*) FILTER (WHERE NOT actual)::int
  FROM movimientos WHERE estado_nuevo='REABIERTO'
)
SELECT to_char(p.desde,'YYYY-MM-DD') AS desde,
  to_char(p.hasta,'YYYY-MM-DD') AS hasta,
  current_timestamp AS calculado_en,
  current_setting('TimeZone') AS zona_horaria,
  (SELECT jsonb_build_object('desde',to_char(a.desde,'YYYY-MM-DD'),'hasta',to_char(a.hasta,'YYYY-MM-DD'),
    'dias',p.hasta-p.desde+1,
    'indicadores',(SELECT jsonb_agg(jsonb_build_object('nombre',indicador,'actual',actual,'anterior',anterior,
      'variacion_porcentual',round((actual-anterior)*100.0/nullif(anterior,0),1)) ORDER BY orden)
      FROM comparables)) FROM anterior a) AS comparacion,
  (SELECT jsonb_build_object('casos_cerrados',count(*)::int,
    'dias_promedio',round(avg(cerrado_en::date-abierto_en::date),1)) FROM cierres) AS gestion,
  (SELECT jsonb_build_object(
    'cierres',count(*) FILTER (WHERE estado_nuevo='CERRADO')::int,
    'casos_con_cierre',count(DISTINCT caso_id) FILTER (WHERE estado_nuevo='CERRADO')::int,
    'reaperturas',count(*) FILTER (WHERE estado_nuevo='REABIERTO')::int,
    'casos_reabiertos',count(DISTINCT caso_id) FILTER (WHERE estado_nuevo='REABIERTO')::int)
    FROM movimientos WHERE actual) AS movimientos,
  (${OPCIONES_INDICADORES}) AS opciones,
  (SELECT count(*)::int FROM hechos) AS total_situaciones,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('fecha',fecha,'total',total) ORDER BY fecha),'[]'::jsonb)
   FROM (SELECT fecha,count(*)::int total FROM hechos GROUP BY fecha) x) AS por_dia,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('mes',mes,'total',total) ORDER BY mes),'[]'::jsonb)
   FROM (SELECT to_char(fecha,'YYYY-MM') mes,count(*)::int total FROM hechos GROUP BY 1) x) AS por_mes,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',nombre,'total',total) ORDER BY total DESC,nombre),'[]'::jsonb)
   FROM (SELECT coalesce(cat.nombre,'Sin especificar') nombre,count(*)::int total
         FROM hechos h LEFT JOIN convi.categorias_convivencia cat ON cat.id=h.categoria_id GROUP BY 1) x) AS por_categoria,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',nombre,'total',total) ORDER BY total DESC,nombre),'[]'::jsonb)
   FROM (SELECT coalesce(lugar,'Sin especificar') nombre,count(*)::int total FROM hechos GROUP BY 1) x) AS por_lugar,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',nombre,'total',total) ORDER BY total DESC,nombre),'[]'::jsonb)
   FROM (SELECT coalesce(c.nombre || ' · ' || a.anio::text,'Sin curso indicado') nombre,count(*)::int total
         FROM hechos h LEFT JOIN convi.cursos c ON c.id=h.curso_contexto_id
         LEFT JOIN convi.anios_academicos a ON a.id=c.anio_academico_id GROUP BY 1) x) AS por_curso,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',nombre,'total',total) ORDER BY total DESC,nombre),'[]'::jsonb)
   FROM (SELECT coalesce(n.nombre,'Sin nivel indicado') nombre,count(*)::int total FROM hechos h
     LEFT JOIN convi.cursos c ON c.id=h.curso_contexto_id
     LEFT JOIN convi.niveles_educativos n ON n.id=c.nivel_id GROUP BY 1) x) AS por_nivel,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('mes',mes,'nombre',nombre,'total',total) ORDER BY mes,nombre),'[]'::jsonb)
   FROM (SELECT to_char(h.fecha,'YYYY-MM') mes,coalesce(c.nombre,'Sin especificar') nombre,count(*)::int total
     FROM hechos h LEFT JOIN convi.categorias_convivencia c ON c.id=h.categoria_id GROUP BY 1,2) x) AS categorias_por_mes,
  (SELECT jsonb_build_object(
    'total',count(*)::int,
    'vencidos',count(*) FILTER (WHERE estado NOT IN ('COMPLETADO','CANCELADO') AND vence_en < current_timestamp)::int,
    'pendientes',count(*) FILTER (WHERE estado NOT IN ('COMPLETADO','CANCELADO') AND vence_en >= current_timestamp)::int,
    'completados',count(*) FILTER (WHERE estado='COMPLETADO')::int,
    'cancelados',count(*) FILTER (WHERE estado='CANCELADO')::int)
   FROM compromisos) AS compromisos,
  (SELECT jsonb_build_object(
    'total',count(*)::int,
    'vencidos',count(*) FILTER (WHERE estado IN ('PLANIFICADA','POSPUESTA') AND programado_en < current_timestamp)::int,
    'pendientes',count(*) FILTER (WHERE estado IN ('PLANIFICADA','POSPUESTA') AND programado_en >= current_timestamp)::int,
    'completados',count(*) FILTER (WHERE estado='REALIZADA')::int,
    'cancelados',count(*) FILTER (WHERE estado='CANCELADA')::int)
   FROM seguimientos) AS seguimientos,
  (SELECT jsonb_build_object(
    'total',count(*)::int,
    'con_plazo',count(fecha_limite_cierre)::int,
    'sin_plazo',count(*) FILTER (WHERE fecha_limite_cierre IS NULL)::int,
    'oportunos',count(*) FILTER (WHERE fecha_limite_cierre IS NOT NULL AND cerrado_en::date <= fecha_limite_cierre)::int,
    'porcentaje_oportunos',round(count(*) FILTER (WHERE fecha_limite_cierre IS NOT NULL AND cerrado_en::date <= fecha_limite_cierre)*100.0/nullif(count(fecha_limite_cierre),0),0))
   FROM cierres) AS cierres
FROM parametros p`;
