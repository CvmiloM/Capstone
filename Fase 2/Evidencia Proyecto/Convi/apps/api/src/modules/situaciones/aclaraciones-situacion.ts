import type { PoolClient } from 'pg';

export type AclaracionSituacion = {
  id: string;
  pregunta: string;
  solicitado_por: string;
  solicitado_en: Date;
  estado: string;
  respuesta: string | null;
  respondido_en: Date | null;
};

export async function aclaracionesDeSituaciones(
  db: PoolClient,
  situacionesIds: string[],
) {
  if (situacionesIds.length === 0) return [];
  const resultado = await db.query<AclaracionSituacion & { situacion_id: string }>(
    `SELECT a.id, a.situacion_id, a.pregunta,
            ps.nombres || ' ' || ps.apellidos AS solicitado_por,
            a.solicitado_en, a.estado, a.respuesta, a.respondido_en
     FROM convi.aclaraciones_situacion a
     JOIN convi.membresias_establecimiento ms ON ms.id = a.solicitado_por
     JOIN convi.personas ps ON ps.id = ms.persona_id
     WHERE a.situacion_id = ANY($1::uuid[])
     ORDER BY a.solicitado_en, a.id`,
    [situacionesIds],
  );
  return resultado.rows;
}
