import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';

export function paginaPortal(consulta: Record<string, unknown>) {
  if (
    Object.keys(consulta).some((k) => k !== 'pagina') ||
    (consulta.pagina !== undefined &&
      (typeof consulta.pagina !== 'string' ||
        !/^\d{1,5}$/.test(consulta.pagina)))
  )
    throw new BadRequestException('Elige una página válida');
  const pagina = Number(consulta.pagina ?? 1);
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 10000)
    throw new BadRequestException('Elige una página válida');
  return pagina;
}

// Una participación corregida y terminada deja de dar acceso al caso.
export const PARTICIPA_EN_CASO = `EXISTS (
  SELECT 1 FROM convi.participaciones pa
  JOIN convi.estudiantes hijo ON hijo.persona_id=pa.persona_id
  LEFT JOIN convi.situaciones s ON s.id=pa.situacion_id
  WHERE hijo.id=$1 AND pa.activo_hasta IS NULL AND pa.activo_desde<=now()
    AND (pa.caso_id=c.id OR s.caso_id=c.id))`;

export async function comprobarCasoHijo(
  db: PoolClient,
  estudianteId: string,
  casoId: string,
) {
  const { rows } = await db.query(
    `SELECT c.id FROM convi.casos c WHERE c.id=$2 AND ${PARTICIPA_EN_CASO}`,
    [estudianteId, casoId],
  );
  if (!rows[0])
    throw new NotFoundException(
      'El caso no está disponible para este estudiante',
    );
}

export type RegistroPortal = {
  id: string;
  tipo: string;
  fecha: string;
  descripcion: string;
  estado: string | null;
  archivo: string | null;
  tamano_bytes: number | null;
};

// Lista cerrada de antecedentes de negocio, nunca las filas técnicas de auditoría o IA.
export const REGISTROS_PORTAL = `
  SELECT v.origen_id AS id,v.tipo,v.fecha_evento AS fecha,
    CASE WHEN v.tipo='ACTUACION' THEN concat_ws(E'\n',a.tipo_actuacion,a.objetivo,a.descripcion,a.resultado,a.proxima_accion)
         WHEN v.tipo='COMPROMISO' THEN concat_ws(E'\n',co.descripcion,co.nota_cumplimiento)
         ELSE v.descripcion END AS descripcion,
    coalesce(a.estado,co.estado) AS estado,ar.nombre_original AS archivo,ar.tamano_bytes
  FROM convi.vw_cronologia_caso v
  LEFT JOIN convi.actuaciones a ON v.tipo='ACTUACION' AND a.id=v.origen_id
  LEFT JOIN convi.compromisos co ON v.tipo='COMPROMISO' AND co.id=v.origen_id
  LEFT JOIN convi.evidencias ev ON v.tipo='EVIDENCIA' AND ev.id=v.origen_id
  LEFT JOIN convi.archivos ar ON ar.id=ev.archivo_id
  WHERE v.caso_id=$1 AND v.tipo IN ('APERTURA','SITUACION','REVISION','ESTADO','ACTUACION','COMPROMISO',
    'COMPROMISO_REVISADO','COMUNICACION','EVIDENCIA','PROTOCOLO','ACLARACION','RESPUESTA_ACLARACION')
  UNION ALL
  SELECT pa.id,'PARTICIPANTE',pa.activo_desde,p.nombres||' '||p.apellidos||' · '||pa.rol_contextual,NULL,NULL,NULL
  FROM convi.participaciones pa JOIN convi.personas p ON p.id=pa.persona_id
  LEFT JOIN convi.situaciones s ON s.id=pa.situacion_id
  LEFT JOIN convi.actuaciones a ON a.id=pa.actuacion_id
  WHERE (pa.caso_id=$1 OR s.caso_id=$1 OR a.caso_id=$1) AND pa.activo_hasta IS NULL AND pa.activo_desde<=now()
  UNION ALL
  SELECT pl.id,'PLAN',pl.creado_en,pl.objetivo,pl.estado,NULL,NULL
  FROM convi.planes_intervencion pl WHERE pl.caso_id=$1
  UNION ALL
  SELECT ac.id,'ACCION_PLAN',ac.creado_en,concat_ws(E'\n',ac.descripcion,ac.notas),ac.estado,NULL,NULL
  FROM convi.acciones_plan_intervencion ac JOIN convi.planes_intervencion pl ON pl.id=ac.plan_intervencion_id WHERE pl.caso_id=$1`;
