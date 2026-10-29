import { errorDeCampos, fechaValida, objeto, texto } from './curso.js';

export function validarVencimientoAcceso(cuerpo: unknown) {
  const datos = objeto(cuerpo);
  const vence = texto(datos.vence_el);
  if (
    Object.keys(datos).some((k) => k !== 'vence_el') ||
    !fechaValida(vence) ||
    vence < '0001-01-01' ||
    vence >= '9999-12-31'
  )
    throw errorDeCampos(
      { vence_el: 'Elige una fecha de vencimiento válida' },
      'Revisa el vencimiento del acceso',
    );
  return vence;
}

// Se reutiliza en la ficha del estudiante y en la lista paginada, sin consultas por tarjeta.
export const CAMPOS_ACCESO_APODERADO = `
  cuenta_portal.id AS cuenta_id, cuenta_portal.codigo_perfil AS perfil_cuenta,
  cuenta_portal.estado AS estado_cuenta, cuenta_portal.correo_invitacion AS correo_cuenta,
  acceso_portal.id AS acceso_id,
  CASE WHEN acceso_portal.estado = 'ACTIVO' AND acceso_portal.expira_en <= now() THEN 'EXPIRADO'
       ELSE acceso_portal.estado END AS estado_acceso,
  to_char(acceso_portal.expira_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expira_en,
  (acceso_portal.expira_en - interval '1 microsecond')::date::text AS vence_el,
  to_char(acceso_portal.otorgado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS otorgado_en,
  to_char(acceso_portal.revocado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS revocado_en,
  coalesce(cuenta_portal.codigo_perfil = 'APODERADO' AND cuenta_portal.estado = 'ACTIVO'
    AND acceso_portal.estado = 'ACTIVO' AND acceso_portal.otorgado_en <= now() AND acceso_portal.expira_en > now()
    AND (a.activo_desde IS NULL OR a.activo_desde <= current_date)
    AND (a.activo_hasta IS NULL OR a.activo_hasta >= current_date), false) AS acceso_habilitado`;

export const UNIONES_ACCESO_APODERADO = `
  LEFT JOIN convi.membresias_establecimiento cuenta_portal
    ON cuenta_portal.persona_id = a.persona_apoderado_id AND cuenta_portal.establecimiento_id = a.establecimiento_id
  LEFT JOIN LATERAL (
    SELECT x.* FROM convi.accesos_apoderado x
    WHERE x.apoderado_estudiante_id = a.id AND x.establecimiento_id = a.establecimiento_id
    ORDER BY (x.estado = 'ACTIVO' AND x.expira_en > now()) DESC, x.otorgado_en DESC, x.id DESC LIMIT 1
  ) acceso_portal ON true`;

export type ResumenAccesoApoderado = {
  cuenta_id: string | null;
  perfil_cuenta: string | null;
  estado_cuenta: string | null;
  correo_cuenta: string | null;
  acceso_id: string | null;
  estado_acceso: string | null;
  expira_en: string | null;
  vence_el: string | null;
  otorgado_en: string | null;
  revocado_en: string | null;
  acceso_habilitado: boolean;
};
