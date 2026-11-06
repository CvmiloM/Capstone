import { Inject, Injectable } from '@nestjs/common';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  ESTADOS_TERMINADOS,
  leerFiltrosCalendario,
  MAXIMO_EVENTOS,
  type TipoEvento,
} from './calendario.js';

export type EventoCalendario = {
  tipo: TipoEvento;
  origen_id: string;
  caso_id: string | null;
  caso_codigo: string | null;
  /** ENTREVISTA, REUNION, SEGUIMIENTO… solo en las actuaciones. */
  tipo_actuacion: string | null;
  /** Acción del Plan de Gestión a la que pertenece la actividad (CA3). */
  accion_plan: string | null;
  titulo: string;
  estado: string;
  /** AAAA-MM-DD y HH:MI en la zona horaria de la escuela. */
  dia: string;
  hora: string;
  dia_fin: string | null;
  hora_fin: string | null;
  /** Ya pasó su fecha y sigue pendiente. */
  vencido: boolean;
  terminado: boolean;
};

export type MesCalendario = {
  mes: string;
  /** Lunes antes del día 1 y domingo después del último día, para la grilla. */
  desde: string;
  hasta: string;
  hoy: string;
  zona_horaria: string;
  eventos: EventoCalendario[];
  /** Hay más eventos que MAXIMO_EVENTOS y no se muestran todos. */
  recortado: boolean;
};

/**
 * PB-085 (HU-074): eventos del mes para el calendario de Convivencia, en una
 * sola consulta. La vista vw_calendario usa los permisos de quien consulta
 * (security_invoker), así que la base solo entrega lo de la escuela de la
 * sesión, y cada evento abre su registro de origen, que vuelve a comprobar el
 * permiso (CA1). El calendario solo lee: se edita en el origen (CA2).
 */
@Injectable()
export class CalendarioService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  mes(
    sesion: Sesion,
    consulta: Record<string, unknown> = {},
  ): Promise<MesCalendario> {
    const filtros = leerFiltrosCalendario(consulta);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      async (db) => {
        const resultado = await db.query<MesCalendario>(
          `WITH m AS (
             SELECT to_date(coalesce($1::text, to_char(current_date, 'YYYY-MM')) || '-01',
                            'YYYY-MM-DD') AS primero
           ), r AS (
             SELECT primero,
               primero - (extract(isodow FROM primero)::int - 1) AS desde,
               (primero + interval '1 month' - interval '1 day')::date
                 + (7 - extract(isodow FROM (primero + interval '1 month' - interval '1 day'))::int) AS hasta
             FROM m
           ), eventos AS (
             SELECT v.tipo, v.origen_id, v.caso_id, c.codigo AS caso_codigo,
               a.tipo_actuacion, ap.titulo AS accion_plan, v.titulo, v.estado, v.inicio,
               to_char(v.inicio, 'YYYY-MM-DD') AS dia, to_char(v.inicio, 'HH24:MI') AS hora,
               to_char(v.fin, 'YYYY-MM-DD') AS dia_fin, to_char(v.fin, 'HH24:MI') AS hora_fin,
               v.estado = ANY($3::text[]) AS terminado,
               v.estado <> ALL($3::text[]) AND v.inicio < now() AS vencido
             FROM convi.vw_calendario v
             CROSS JOIN r
             LEFT JOIN convi.casos c ON c.id = v.caso_id
             LEFT JOIN convi.actuaciones a ON v.tipo = 'ACTUACION' AND a.id = v.origen_id
             LEFT JOIN convi.actividades_plan_gestion g
               ON v.tipo = 'PLAN_GESTION' AND g.id = v.origen_id
             LEFT JOIN convi.acciones_plan_gestion ap ON ap.id = g.accion_plan_id
             WHERE v.inicio >= r.desde::timestamptz
               AND v.inicio < (r.hasta + 1)::timestamptz
               AND ($2::text[] IS NULL OR v.tipo = ANY($2::text[]))
             ORDER BY v.inicio, v.tipo, v.origen_id
             LIMIT ${MAXIMO_EVENTOS + 1}
           )
           SELECT to_char(r.primero, 'YYYY-MM') AS mes, r.desde::text AS desde,
             r.hasta::text AS hasta, current_date::text AS hoy,
             current_setting('TimeZone') AS zona_horaria,
             (SELECT count(*) > ${MAXIMO_EVENTOS} FROM eventos) AS recortado,
             coalesce((SELECT jsonb_agg(to_jsonb(e) - 'inicio' ORDER BY e.inicio, e.tipo, e.origen_id)
                       FROM (SELECT * FROM eventos ORDER BY inicio, tipo, origen_id
                             LIMIT ${MAXIMO_EVENTOS}) e), '[]'::jsonb) AS eventos
           FROM r`,
          [filtros.mes, filtros.tipos, [...ESTADOS_TERMINADOS]],
        );
        return resultado.rows[0];
      },
    );
  }
}
