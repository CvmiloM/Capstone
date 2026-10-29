import type { PoolClient } from 'pg';
import { errorDeCampos } from './curso.js';

export const APODERADO_REGISTRADO = `(
  EXISTS (SELECT 1 FROM convi.apoderados_estudiante vinculo WHERE vinculo.persona_apoderado_id=p.id)
  OR EXISTS (SELECT 1 FROM convi.membresias_establecimiento cuenta WHERE cuenta.persona_id=p.id AND cuenta.codigo_perfil='APODERADO')
) AND NOT EXISTS (
  SELECT 1 FROM convi.membresias_establecimiento cuenta WHERE cuenta.persona_id=p.id AND cuenta.codigo_perfil<>'APODERADO'
)`;

export async function comprobarCorreoApoderado(
  db: PoolClient,
  correo: string | null,
) {
  if (!correo) return;
  const { rows } = await db.query(
    'SELECT convi.correo_apoderado_incompatible($1) AS incompatible',
    [correo],
  );
  if (rows[0]?.incompatible)
    throw errorDeCampos({
      correo:
        'Este correo ya tiene una cuenta activa en CONVI, usa otro correo',
    });
}
