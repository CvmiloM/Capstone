import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { leerFiltrosAvisos, POR_PAGINA_AVISOS } from './atencion.js';

// PB-095 (HU-082): cada profesional de Convivencia ve y marca como leídos solo
// sus propios avisos. Del aviso solo cambia la fecha de lectura (HU-081 CA4),
// y la base exige que la marque su destinatario y que no cambie después. Las
// escrituras usan READ COMMITTED: si dos pestañas marcan el mismo aviso a la
// vez, la segunda ve que ya está leído y no lo toca.
const PERFILES: Perfil[] = ['CONVIVENCIA'];

const NO_EXISTE = 'El aviso no existe.';
const PROPIO = 'n.membresia_destinatario_id = convi.membresia_actual()';

export type Aviso = {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  creado_en: string;
  leido_en: string | null;
  expira_en: string | null;
  /** HU-081 CA3: un aviso vencido ya no lleva a su registro. */
  vencido: boolean;
  /** Si apunta a un registro que se puede abrir. */
  con_destino: boolean;
};

type PaginaAvisos = {
  avisos: Aviso[];
  total: number;
  pagina: number;
  limite: number;
  no_leidos: number;
  /** Zona horaria de la escuela, para mostrar las fechas sin otra consulta. */
  zona_horaria: string;
};

/** A dónde lleva el aviso en el portal; null si no lleva a ningún lado. */
export type DestinoAviso = {
  tipo: 'alerta' | 'situacion' | 'caso' | 'documento';
  id: string;
  /** Pestaña de la ficha del caso y elemento dentro de ella. */
  seccion?: string;
  ancla?: string;
} | null;

/**
 * HU-081 CA3: vuelve a buscar el registro con la seguridad por fila de la
 * escuela. Lo que vive en la ficha del caso abre su pestaña. Las actividades
 * del Plan de Gestión aún no tienen pantalla (por defecto: sin destino).
 */
const DESTINO = `CASE n.tipo_recurso
  WHEN 'alertas' THEN (SELECT jsonb_build_object('tipo', 'alerta', 'id', x.id)
    FROM convi.alertas x WHERE x.id = n.recurso_id)
  WHEN 'situaciones' THEN (SELECT jsonb_build_object('tipo', 'situacion', 'id', x.id)
    FROM convi.situaciones x WHERE x.id = n.recurso_id)
  WHEN 'aclaraciones_situacion' THEN (SELECT jsonb_build_object('tipo', 'situacion', 'id', x.situacion_id)
    FROM convi.aclaraciones_situacion x WHERE x.id = n.recurso_id)
  WHEN 'casos' THEN (SELECT jsonb_build_object('tipo', 'caso', 'id', x.id)
    FROM convi.casos x WHERE x.id = n.recurso_id)
  WHEN 'actuaciones' THEN (SELECT CASE WHEN x.tipo_actuacion = 'SEGUIMIENTO'
      THEN jsonb_build_object('tipo', 'caso', 'id', x.caso_id, 'seccion', 'seguimientos', 'ancla', 'seguimiento-' || x.id)
      ELSE jsonb_build_object('tipo', 'caso', 'id', x.caso_id, 'seccion', 'encuentros', 'ancla', 'encuentro-' || x.id) END
    FROM convi.actuaciones x WHERE x.id = n.recurso_id)
  WHEN 'compromisos' THEN (SELECT jsonb_build_object('tipo', 'caso', 'id', x.caso_id, 'seccion', 'compromisos')
    FROM convi.compromisos x WHERE x.id = n.recurso_id)
  WHEN 'estados_pasos_protocolo_caso' THEN (SELECT jsonb_build_object('tipo', 'caso', 'id', pc.caso_id,
      'seccion', 'protocolo', 'ancla', 'paso-' || x.id)
    FROM convi.estados_pasos_protocolo_caso x
    JOIN convi.protocolos_caso pc ON pc.id = x.protocolo_caso_id WHERE x.id = n.recurso_id)
  WHEN 'acciones_plan_intervencion' THEN (SELECT jsonb_build_object('tipo', 'caso', 'id', pl.caso_id, 'seccion', 'plan')
    FROM convi.acciones_plan_intervencion x
    JOIN convi.planes_intervencion pl ON pl.id = x.plan_intervencion_id WHERE x.id = n.recurso_id)
  WHEN 'comunicaciones' THEN (SELECT jsonb_build_object('tipo', 'caso', 'id', x.caso_id, 'seccion', 'comunicaciones')
    FROM convi.comunicaciones x WHERE x.id = n.recurso_id)
  WHEN 'versiones_documento' THEN (SELECT jsonb_build_object('tipo', 'documento', 'id', x.id)
    FROM convi.versiones_documento x WHERE x.id = n.recurso_id)
END`;

@Injectable()
export class AvisosService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Los avisos propios, del más reciente al más antiguo: solo los no leídos
  // al entrar, o todos.
  listar(
    sesion: Sesion,
    consulta: Record<string, unknown> = {},
  ): Promise<PaginaAvisos> {
    const filtros = leerFiltrosAvisos(consulta);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<PaginaAvisos>(
          `WITH propios AS MATERIALIZED (
             SELECT n.id, n.creado_en, n.leido_en FROM convi.notificaciones n WHERE ${PROPIO}
           ), filtrados AS (
             SELECT * FROM propios WHERE $1::boolean OR leido_en IS NULL
           ), cuenta AS (
             SELECT count(*)::int AS total,
               least($2::int, greatest(1, ceil(count(*)::numeric / $3)::int)) AS pagina
             FROM filtrados
           ), elegidos AS MATERIALIZED (
             SELECT f.id FROM filtrados f ORDER BY f.creado_en DESC, f.id DESC
             LIMIT $3 OFFSET (SELECT (pagina - 1) * $3 FROM cuenta)
           )
           SELECT cuenta.total, cuenta.pagina, $3::int AS limite,
             current_setting('TimeZone') AS zona_horaria,
             (SELECT count(*)::int FROM propios WHERE leido_en IS NULL) AS no_leidos,
             (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'id', n.id, 'tipo', n.tipo_notificacion, 'titulo', n.titulo, 'cuerpo', n.cuerpo,
                  'creado_en', n.creado_en, 'leido_en', n.leido_en, 'expira_en', n.expira_en,
                  'vencido', coalesce(n.expira_en <= now(), false),
                  'con_destino', n.tipo_recurso IS NOT NULL AND n.recurso_id IS NOT NULL)
                ORDER BY n.creado_en DESC, n.id DESC), '[]'::jsonb)
              FROM elegidos e JOIN convi.notificaciones n ON n.id = e.id) AS avisos
           FROM cuenta`,
          [filtros.todos, filtros.pagina, POR_PAGINA_AVISOS],
        );
        return resultado.rows[0];
      },
    );
  }

  // CA1 y CA2: guarda la fecha de lectura de un aviso propio. Si ya estaba
  // leído se conserva su fecha; el aviso de otra persona no existe para ella.
  marcarLeido(sesion: Sesion, id: string): Promise<{ id: string }> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<{ existe: boolean }>(
          `WITH lectura AS (
             UPDATE convi.notificaciones n SET leido_en = now()
             WHERE n.id = $1 AND ${PROPIO} AND n.leido_en IS NULL RETURNING n.id
           )
           SELECT EXISTS(SELECT 1 FROM lectura)
             OR EXISTS(SELECT 1 FROM convi.notificaciones n WHERE n.id = $1 AND ${PROPIO}) AS existe`,
          [id],
        );
        if (!resultado.rows[0].existe) throw new NotFoundException(NO_EXISTE);
        return { id };
      },
      'READ COMMITTED',
    );
  }

  // Marca como leídos todos los avisos propios que seguían sin leer.
  marcarTodos(sesion: Sesion): Promise<{ marcados: number }> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query(
          `UPDATE convi.notificaciones n SET leido_en = now()
           WHERE ${PROPIO} AND n.leido_en IS NULL`,
        );
        return { marcados: resultado.rowCount ?? 0 };
      },
      'READ COMMITTED',
    );
  }

  // HU-081 CA3 y HU-082 CA2: abrir un aviso lo marca como leído y vuelve a
  // comprobar el permiso. Si la cuenta ya no es de Convivencia activa, la API
  // responde 403 antes de llegar aquí; si el registro ya no existe en la
  // escuela o el aviso venció, no se entrega el destino.
  abrir(sesion: Sesion, id: string): Promise<{ destino: DestinoAviso }> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<{ destino: DestinoAviso }>(
          `WITH lectura AS (
             UPDATE convi.notificaciones n SET leido_en = now()
             WHERE n.id = $1 AND ${PROPIO} AND n.leido_en IS NULL RETURNING n.id
           )
           SELECT CASE WHEN n.expira_en <= now() THEN NULL ELSE ${DESTINO} END AS destino
           FROM convi.notificaciones n WHERE n.id = $1 AND ${PROPIO}`,
          [id],
        );
        if (!resultado.rows[0]) throw new NotFoundException(NO_EXISTE);
        return { destino: resultado.rows[0].destino };
      },
      'READ COMMITTED',
    );
  }
}
