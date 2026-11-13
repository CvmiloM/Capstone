import { COMUNICACION_VISIBLE, PARTICIPA_EN_CASO } from './portal-apoderado.js';

// Consultas de solo lectura del portal del apoderado para un pupilo: resumen,
// historial, situaciones, documentos, reuniones y comunicaciones. Todas reciben el
// estudiante en $1 y corren dentro de CuentaService.operar, que antes comprueba
// que la cuenta es de Apoderado, que su permiso sigue vigente y que el
// estudiante es su pupilo. No cambian nada del modelo de datos.

const CASOS_HIJO = `casos_hijo AS (
  SELECT c.id,c.codigo,c.titulo,c.estado_actual,c.fecha_inicio,c.cerrado_en,c.asignado_a_membresia_id
  FROM convi.casos c WHERE ${PARTICIPA_EN_CASO})`;

// Situaciones en que participa el pupilo, con caso o sin caso, menos las descartadas.
const SITUACIONES_HIJO = `situaciones_hijo AS (
  SELECT s.id,s.codigo,s.ocurrido_en,s.lugar,s.descripcion,s.categoria_id,s.estado,s.caso_id FROM convi.situaciones s
  WHERE s.estado<>'DESCARTADA' AND EXISTS (
    SELECT 1 FROM convi.participaciones pa JOIN convi.estudiantes hijo ON hijo.persona_id=pa.persona_id
    WHERE hijo.id=$1 AND pa.situacion_id=s.id AND pa.activo_hasta IS NULL AND pa.activo_desde<=now()))`;

// Los mismos archivos que ya se descargan desde el detalle de cada caso.
const DOCUMENTOS_HIJO = `documentos_hijo AS (
  SELECT ev.id,ev.titulo::text AS titulo,ev.tipo_evidencia::text AS tipo,coalesce(ev.fecha_documento,ev.creado_en) AS fecha,
    ev.caso_contexto_id AS caso_id,ev.actuacion_id,ev.rectifica_evidencia_id IS NOT NULL AS rectifica,
    ar.nombre_original::text AS archivo,ar.tipo_mime::text AS tipo_mime,ar.tamano_bytes::int AS tamano_bytes
  FROM convi.vw_evidencias_contexto ev JOIN convi.archivos ar ON ar.id=ev.archivo_id
  WHERE ev.caso_contexto_id IN (SELECT id FROM casos_hijo))`;

// Archivos de esas situaciones: los que se adjuntaron a la situación y los de
// las respuestas a sus aclaraciones, subidos por profesores o por Convivencia.
const ARCHIVOS_SITUACION = `archivos_situacion AS (
  SELECT ev.id,coalesce(ev.situacion_id,ac.situacion_id) AS situacion_id,ev.titulo::text AS titulo,
    ev.tipo_evidencia::text AS tipo,coalesce(ev.fecha_documento,ev.creado_en) AS fecha,
    ar.nombre_original::text AS archivo,ar.tipo_mime::text AS tipo_mime,ar.tamano_bytes::int AS tamano_bytes
  FROM convi.evidencias ev JOIN convi.archivos ar ON ar.id=ev.archivo_id
  LEFT JOIN convi.aclaraciones_situacion ac ON ac.id=ev.aclaracion_id
  WHERE coalesce(ev.situacion_id,ac.situacion_id) IN (SELECT id FROM situaciones_hijo))`;

const CON_PUPILO = `WITH ${CASOS_HIJO},${SITUACIONES_HIJO},${DOCUMENTOS_HIJO},${ARCHIVOS_SITUACION}`;

const nombreMiembro = (membresia: string) =>
  `(SELECT pm.nombres||' '||pm.apellidos FROM convi.membresias_establecimiento mm
    JOIN convi.personas pm ON pm.id=mm.persona_id WHERE mm.id=${membresia})`;

// Línea de tiempo del pupilo: sus situaciones, la apertura y el cierre de sus
// casos, los encuentros realizados con sus actas, los compromisos, las
// comunicaciones y los demás documentos. Cada situación aparece con su código,
// fecha, categoría y estado, y su relato completo está en la sección Situaciones.
export const HISTORIAL_PUPILO = `
  SELECT s.id,'SITUACION'::text AS tipo,s.ocurrido_en AS fecha,s.codigo::text AS titulo,cat.nombre::text AS detalle,
    s.estado::text AS estado,NULL::text AS responsable,s.caso_id,ch.codigo::text AS caso_codigo,'[]'::json AS documentos
  FROM situaciones_hijo s LEFT JOIN convi.categorias_convivencia cat ON cat.id=s.categoria_id
  LEFT JOIN casos_hijo ch ON ch.id=s.caso_id
  UNION ALL
  SELECT c.id,'CASO',c.fecha_inicio::timestamptz,c.codigo,c.titulo,c.estado_actual,${nombreMiembro('c.asignado_a_membresia_id')},
    c.id,c.codigo,'[]'::json FROM casos_hijo c
  UNION ALL
  SELECT c.id,'CIERRE',c.cerrado_en,c.codigo,c.titulo,c.estado_actual,${nombreMiembro('c.asignado_a_membresia_id')},
    c.id,c.codigo,'[]'::json FROM casos_hijo c WHERE c.estado_actual='CERRADO' AND c.cerrado_en IS NOT NULL
  UNION ALL
  SELECT a.id,'ACTUACION',a.realizado_en,a.tipo_actuacion,a.objetivo,a.estado,${nombreMiembro('a.membresia_responsable_id')},
    a.caso_id,ch.codigo,coalesce((SELECT json_agg(json_build_object('id',d.id,'titulo',d.titulo,'caso_id',d.caso_id) ORDER BY d.fecha,d.id)
      FROM documentos_hijo d WHERE d.actuacion_id=a.id),'[]'::json)
  FROM convi.actuaciones a JOIN casos_hijo ch ON ch.id=a.caso_id WHERE a.estado='REALIZADA'
  UNION ALL
  SELECT co.id,'COMPROMISO',co.creado_en,'Compromiso',co.descripcion,co.estado,NULL,co.caso_id,ch.codigo,'[]'::json
  FROM convi.compromisos co JOIN casos_hijo ch ON ch.id=co.caso_id
  UNION ALL
  SELECT cm.id,'COMUNICACION',coalesce(cm.enviado_en,cm.ocurrido_en,cm.creado_en),cm.tipo_comunicacion,coalesce(cm.asunto,cm.resumen),
    cm.estado_entrega,NULL,cm.caso_id,ch.codigo,'[]'::json
  FROM convi.comunicaciones cm JOIN casos_hijo ch ON ch.id=cm.caso_id WHERE cm.${COMUNICACION_VISIBLE}
  UNION ALL
  SELECT d.id,'DOCUMENTO',d.fecha,d.titulo,d.archivo,NULL,NULL,d.caso_id,ch.codigo,
    json_build_array(json_build_object('id',d.id,'titulo',d.titulo,'caso_id',d.caso_id))
  FROM documentos_hijo d JOIN casos_hijo ch ON ch.id=d.caso_id
  WHERE NOT EXISTS (SELECT 1 FROM convi.actuaciones a JOIN casos_hijo c2 ON c2.id=a.caso_id
    WHERE a.id=d.actuacion_id AND a.estado='REALIZADA')`;

const REUNIONES_PUPILO = `
  SELECT a.id,a.tipo_actuacion::text AS tipo,a.estado::text AS estado,a.programado_en,a.fin_programado_en,a.realizado_en,a.fin_real_en,
    a.lugar::text AS lugar,a.objetivo AS motivo,${nombreMiembro('a.membresia_responsable_id')} AS profesional,a.caso_id,ch.codigo::text AS caso_codigo,
    coalesce(a.realizado_en,a.programado_en) AS fecha,
    (a.estado IN ('PLANIFICADA','POSPUESTA') AND coalesce(a.fin_programado_en,a.programado_en)>=now()) AS proxima
  FROM convi.actuaciones a JOIN casos_hijo ch ON ch.id=a.caso_id
  WHERE coalesce(a.realizado_en,a.programado_en) IS NOT NULL`;

const COMUNICACIONES_PUPILO = `
  SELECT cm.id,cm.tipo_comunicacion::text AS tipo,cm.asunto::text AS asunto,cm.resumen,
    coalesce(cm.enviado_en,cm.ocurrido_en,cm.creado_en) AS fecha,cm.estado_entrega::text AS estado,cm.caso_id,ch.codigo::text AS caso_codigo,
    coalesce(cm.persona_destinataria_id=(SELECT m.persona_id FROM convi.membresias_establecimiento m WHERE m.id=convi.membresia_actual()),false) AS para_usted
  FROM convi.comunicaciones cm JOIN casos_hijo ch ON ch.id=cm.caso_id WHERE cm.${COMUNICACION_VISIBLE}`;

// Sección Situaciones: por decisión del PO el apoderado ve el relato de todas
// las situaciones en que participa su pupilo, con caso o sin caso, menos las
// descartadas, y los archivos que les adjuntaron.
const SITUACIONES_PUPILO = `
  SELECT s.id,s.codigo::text AS codigo,s.ocurrido_en AS fecha,s.lugar::text AS lugar,cat.nombre::text AS categoria,
    s.estado::text AS estado,s.descripcion AS relato,s.caso_id,ch.codigo::text AS caso_codigo,
    (SELECT count(*) FROM archivos_situacion a WHERE a.situacion_id=s.id)::int AS archivos,
    (SELECT count(*) FROM archivos_situacion a WHERE a.situacion_id=s.id AND a.tipo_mime LIKE 'image/%')::int AS imagenes
  FROM situaciones_hijo s LEFT JOIN convi.categorias_convivencia cat ON cat.id=s.categoria_id
  LEFT JOIN casos_hijo ch ON ch.id=s.caso_id`;

// Una situación del pupilo con sus archivos ($2 es la situación).
export const DETALLE_SITUACION_PUPILO = `${CON_PUPILO}
  SELECT s.id,s.codigo::text AS codigo,s.ocurrido_en AS fecha,s.lugar::text AS lugar,cat.nombre::text AS categoria,
    s.estado::text AS estado,s.descripcion AS relato,s.caso_id,ch.codigo::text AS caso_codigo,
    coalesce((SELECT json_agg(a ORDER BY a.fecha,a.id) FROM (SELECT x.id,x.titulo,x.tipo,x.fecha,x.archivo,x.tipo_mime,x.tamano_bytes
      FROM archivos_situacion x WHERE x.situacion_id=s.id) a),'[]'::json) AS archivos,
    (SELECT p.nombres||' '||p.apellidos FROM convi.estudiantes e JOIN convi.personas p ON p.id=e.persona_id WHERE e.id=$1) AS estudiante,
    (SELECT zona_horaria FROM convi.establecimientos WHERE id=convi.establecimiento_actual()) AS zona_horaria
  FROM situaciones_hijo s LEFT JOIN convi.categorias_convivencia cat ON cat.id=s.categoria_id
  LEFT JOIN casos_hijo ch ON ch.id=s.caso_id
  WHERE s.id=$2`;

// Archivo de una situación del pupilo ($2 la situación y $3 el archivo): solo si
// la situación es suya y el archivo pertenece a esa situación.
export const ARCHIVO_SITUACION_PUPILO = `${CON_PUPILO}
  SELECT ar.nombre_original AS nombre,ar.tipo_mime AS mime,ar.clave_almacenamiento AS clave,ar.bucket_id AS espacio
  FROM archivos_situacion a JOIN convi.evidencias ev ON ev.id=a.id JOIN convi.archivos ar ON ar.id=ev.archivo_id
  WHERE a.id=$3 AND a.situacion_id=$2`;

const DOCUMENTOS_PUPILO = `
  SELECT d.id,d.titulo,d.tipo,d.fecha,d.caso_id,ch.codigo::text AS caso_codigo,d.rectifica,d.archivo,d.tipo_mime,d.tamano_bytes
  FROM documentos_hijo d JOIN casos_hijo ch ON ch.id=d.caso_id`;

// Una sola consulta por página, que en la nube cada ida a la base suma tiempo:
// trae el total, las 50 filas de la página ($2 es el desplazamiento), el
// nombre del pupilo y la zona horaria de la escuela.
function paginada(filas: string, orden: string) {
  return `${CON_PUPILO},filas AS (${filas})
  SELECT (SELECT count(*) FROM filas)::int AS total,
    coalesce((SELECT json_agg(f ORDER BY ${orden}) FROM (SELECT * FROM filas ORDER BY ${orden} LIMIT 50 OFFSET $2) f),'[]'::json) AS elementos,
    (SELECT p.nombres||' '||p.apellidos FROM convi.estudiantes e JOIN convi.personas p ON p.id=e.persona_id WHERE e.id=$1) AS estudiante,
    (SELECT zona_horaria FROM convi.establecimientos WHERE id=convi.establecimiento_actual()) AS zona_horaria`;
}

export const PAGINA_HISTORIAL = paginada(
  HISTORIAL_PUPILO,
  'fecha DESC NULLS LAST,tipo,id',
);
export const PAGINA_DOCUMENTOS = paginada(DOCUMENTOS_PUPILO, 'fecha DESC,id');
export const PAGINA_SITUACIONES = paginada(SITUACIONES_PUPILO, 'fecha DESC,id');
// Primero las reuniones que vienen, de la más cercana a la más lejana, y
// después las pasadas, de la más reciente a la más antigua.
export const PAGINA_REUNIONES = paginada(
  REUNIONES_PUPILO,
  'proxima DESC,CASE WHEN proxima THEN fecha END,fecha DESC,id',
);
export const PAGINA_COMUNICACIONES = paginada(
  COMUNICACIONES_PUPILO,
  'fecha DESC,id',
);

// Ficha y resumen del pupilo en una sola fila: curso de su matrícula vigente,
// profesor jefe, conteos, próxima reunión y el permiso de esta cuenta.
export const RESUMEN_PUPILO = `${CON_PUPILO},historial AS (${HISTORIAL_PUPILO}),
  yo AS (SELECT m.id,m.persona_id,p.nombres::text AS nombres,(p.nombres||' '||p.apellidos)::text AS nombre,
      e.nombre::text AS escuela,e.zona_horaria::text AS zona_horaria
    FROM convi.membresias_establecimiento m JOIN convi.personas p ON p.id=m.persona_id
    JOIN convi.establecimientos e ON e.id=m.establecimiento_id WHERE m.id=convi.membresia_actual())
  SELECT yo.nombre AS apoderado,yo.nombres AS apoderado_nombres,yo.escuela,yo.zona_horaria,current_date::text AS hoy,
    (SELECT row_to_json(x) FROM (
      SELECT e.id,p.nombres||' '||p.apellidos AS nombre,upper(left(p.nombres,1)||left(p.apellidos,1)) AS iniciales,
        e.codigo_estudiante AS codigo,mt.estado AS matricula,
        cu.nombre AS curso,cu.seccion,n.nombre AS nivel,aa.anio,
        (SELECT pj.nombres||' '||pj.apellidos FROM convi.asignaciones_docentes ad
          JOIN convi.membresias_establecimiento mj ON mj.id=ad.membresia_id JOIN convi.personas pj ON pj.id=mj.persona_id
          WHERE ad.curso_id=cu.id AND ad.rol_asignacion='PROFESOR_JEFE' AND mj.estado='ACTIVO'
            AND (ad.fecha_inicio IS NULL OR ad.fecha_inicio<=current_date) AND (ad.fecha_fin IS NULL OR ad.fecha_fin>=current_date)
          ORDER BY ad.fecha_inicio DESC NULLS LAST,ad.id LIMIT 1) AS profesor_jefe
      FROM convi.estudiantes e JOIN convi.personas p ON p.id=e.persona_id
      LEFT JOIN LATERAL (SELECT m2.estado,m2.curso_id,m2.anio_academico_id FROM convi.matriculas m2
          JOIN convi.anios_academicos a2 ON a2.id=m2.anio_academico_id WHERE m2.estudiante_id=e.id
          ORDER BY (m2.estado='ACTIVO') DESC,(a2.estado='ACTIVO') DESC,a2.anio DESC,m2.matriculado_en DESC NULLS LAST,m2.id LIMIT 1) mt ON true
      LEFT JOIN convi.cursos cu ON cu.id=mt.curso_id
      LEFT JOIN convi.niveles_educativos n ON n.id=cu.nivel_id
      LEFT JOIN convi.anios_academicos aa ON aa.id=mt.anio_academico_id
      WHERE e.id=$1) x) AS estudiante,
    json_build_object(
      'situaciones',(SELECT count(*) FROM situaciones_hijo),
      'casos_activos',(SELECT count(*) FROM casos_hijo WHERE estado_actual<>'CERRADO'),
      'casos_cerrados',(SELECT count(*) FROM casos_hijo WHERE estado_actual='CERRADO'),
      'encuentros_realizados',(SELECT count(*) FROM convi.actuaciones a JOIN casos_hijo ch ON ch.id=a.caso_id WHERE a.estado='REALIZADA'),
      'documentos',(SELECT count(*) FROM documentos_hijo),
      'comunicaciones',(SELECT count(*) FROM convi.comunicaciones cm JOIN casos_hijo ch ON ch.id=cm.caso_id WHERE cm.${COMUNICACION_VISIBLE}),
      'historial',(SELECT count(*) FROM historial)) AS conteos,
    (SELECT row_to_json(x) FROM (SELECT a.id,a.tipo_actuacion AS tipo,a.programado_en AS fecha,a.lugar
      FROM convi.actuaciones a JOIN casos_hijo ch ON ch.id=a.caso_id
      WHERE a.estado IN ('PLANIFICADA','POSPUESTA') AND coalesce(a.fin_programado_en,a.programado_en)>=now()
      ORDER BY a.programado_en,a.id LIMIT 1) x) AS proxima_reunion,
    (SELECT row_to_json(x) FROM (SELECT ax.estado,ax.otorgado_en,ax.expira_en,ae.tipo_relacion,ae.es_principal
      FROM convi.apoderados_estudiante ae JOIN convi.accesos_apoderado ax ON ax.apoderado_estudiante_id=ae.id
      WHERE ae.estudiante_id=$1 AND ae.persona_apoderado_id=yo.persona_id AND ax.membresia_apoderado_id=yo.id
      ORDER BY (ax.estado='ACTIVO' AND ax.expira_en>now()) DESC,ax.expira_en DESC NULLS LAST,ax.id LIMIT 1) x) AS acceso,
    (SELECT count(DISTINCT ae.estudiante_id) FROM convi.apoderados_estudiante ae
      JOIN convi.accesos_apoderado ax ON ax.apoderado_estudiante_id=ae.id
      WHERE ae.persona_apoderado_id=yo.persona_id AND ax.membresia_apoderado_id=yo.id
        AND convi.puede_ver_estudiante(ae.estudiante_id))::int AS pupilos
  FROM yo`;
