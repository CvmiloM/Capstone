import { Inject, Injectable } from '@nestjs/common';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { ESTADOS_TERMINADOS } from '../calendario/calendario.js';
import { leerBusquedaBandeja } from './bandeja.js';

@Injectable()
export class JornadaService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  seguimientos(sesion: Sesion, pagina: unknown) {
    const f = leerBusquedaBandeja({ pagina });
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      async (db) => {
        return (
          await db.query(
            `WITH pendientes AS (
        SELECT a.id,a.caso_id,c.codigo,c.titulo,
          to_char(a.programado_en,'DD-MM-YYYY HH24:MI') AS fecha,a.programado_en
        FROM convi.actuaciones a JOIN convi.casos c ON c.id=a.caso_id
        WHERE a.tipo_actuacion='SEGUIMIENTO' AND a.estado <> ALL($1::text[])
          AND a.programado_en < (current_date+1)::timestamptz
      ) SELECT (SELECT count(*)::int FROM pendientes) AS total,$2::int AS pagina,
        coalesce((SELECT jsonb_agg(f ORDER BY programado_en,id) FROM (
          SELECT * FROM pendientes ORDER BY programado_en,id LIMIT 20 OFFSET (($2::int-1)*20)
        ) f),'[]') AS filas`,
            [[...ESTADOS_TERMINADOS], f.pagina],
          )
        ).rows[0];
      },
    );
  }

  leer(sesion: Sesion) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      async (db) => {
        const { rows } = await db.query(
          `WITH
        eventos AS MATERIALIZED (
          SELECT v.*, a.tipo_actuacion, c.codigo AS caso_codigo
          FROM convi.vw_calendario v
          LEFT JOIN convi.actuaciones a ON v.tipo='ACTUACION' AND a.id=v.origen_id
          LEFT JOIN convi.casos c ON c.id=v.caso_id
          WHERE v.estado <> ALL($1::text[])
          AND v.inicio < (current_date+1)::timestamptz
          AND (v.inicio>=current_date::timestamptz OR (v.tipo='ACTUACION' AND a.tipo_actuacion='SEGUIMIENTO'))
        ), prioridades AS (
          SELECT s.id, 'SITUACION'::text AS tipo, s.codigo,
            coalesce(cat.nombre,'Situación por revisar') AS titulo,
            CASE WHEN s.urgencia IN ('URGENTE','INMEDIATA') THEN 'Urgente' ELSE 'Nueva' END AS etiqueta,
            '/convivencia/situaciones/' || s.id AS href, s.reportado_en AS fecha,
            CASE s.urgencia WHEN 'INMEDIATA' THEN 0 WHEN 'URGENTE' THEN 1 ELSE 3 END AS prioridad
          FROM convi.situaciones s LEFT JOIN convi.categorias_convivencia cat ON cat.id=s.categoria_id
          WHERE s.estado IN ('NUEVA','EN_REVISION','INFORMACION_SOLICITADA')
            AND (s.estado='NUEVA' OR s.urgencia IN ('URGENTE','INMEDIATA'))
          UNION ALL
          SELECT origen_id, 'SEGUIMIENTO', caso_codigo, titulo, 'Por realizar',
            '/convivencia/casos/' || caso_id || '?seccion=seguimientos#seguimiento-' || origen_id,
            inicio, 2 FROM eventos
          WHERE tipo='ACTUACION' AND tipo_actuacion='SEGUIMIENTO'
            AND inicio < (current_date + 1)::timestamptz
          UNION ALL
          SELECT id, 'CASO', codigo, titulo, 'Cierre sugerido vencido',
            '/convivencia/casos/' || id, fecha_limite_cierre::timestamptz, 4
          FROM convi.casos WHERE estado_actual<>'CERRADO' AND fecha_limite_cierre<current_date
        ), planes AS (
          SELECT pg.id,pg.nombre,y.anio,
            count(g.id)::int AS total,
            count(g.id) FILTER (WHERE g.estado='COMPLETADO')::int AS completadas,
            count(g.id) FILTER (WHERE g.estado='CANCELADO')::int AS canceladas
          FROM convi.planes_gestion pg JOIN convi.anios_academicos y ON y.id=pg.anio_academico_id
          LEFT JOIN convi.objetivos_plan_gestion o ON o.plan_gestion_id=pg.id
          LEFT JOIN convi.acciones_plan_gestion ac ON ac.objetivo_id=o.id
          LEFT JOIN convi.actividades_plan_gestion g ON g.accion_plan_id=ac.id
          WHERE pg.estado='ACTIVO' AND y.anio=extract(year FROM current_date)::int
          GROUP BY pg.id,pg.nombre,y.anio
        ) SELECT current_date::text AS hoy,current_setting('TimeZone') AS zona_horaria,
          (SELECT count(*)::int FROM convi.situaciones WHERE estado='NUEVA') AS nuevas,
          (SELECT count(*)::int FROM convi.situaciones WHERE estado IN ('NUEVA','EN_REVISION','INFORMACION_SOLICITADA') AND urgencia IN ('URGENTE','INMEDIATA')) AS urgentes,
          (SELECT count(*)::int FROM eventos WHERE tipo='ACTUACION' AND tipo_actuacion='SEGUIMIENTO' AND inicio<(current_date+1)::timestamptz) AS seguimientos,
          (SELECT count(*)::int FROM eventos WHERE inicio>=current_date::timestamptz AND inicio<(current_date+1)::timestamptz) AS agenda_total,
          coalesce((SELECT jsonb_agg(f ORDER BY prioridad,fecha,id) FROM (SELECT * FROM prioridades ORDER BY prioridad,fecha,id LIMIT 8) f),'[]') AS prioridades,
          coalesce((SELECT jsonb_agg(f ORDER BY hora,titulo,origen_id) FROM (
            SELECT tipo,origen_id,caso_id,caso_codigo,tipo_actuacion,titulo,estado,
              to_char(inicio,'YYYY-MM-DD') AS dia,to_char(inicio,'HH24:MI') AS hora,
              to_char(fin,'YYYY-MM-DD') AS dia_fin,to_char(fin,'HH24:MI') AS hora_fin,
              inicio<now() AS vencido,false AS terminado
            FROM eventos WHERE inicio>=current_date::timestamptz AND inicio<(current_date+1)::timestamptz
            ORDER BY inicio,titulo,origen_id LIMIT 8) f),'[]') AS agenda,
          coalesce((SELECT jsonb_agg(p ORDER BY nombre,id) FROM planes p),'[]') AS planes`,
          [[...ESTADOS_TERMINADOS]],
        );
        return rows[0];
      },
    );
  }
}
