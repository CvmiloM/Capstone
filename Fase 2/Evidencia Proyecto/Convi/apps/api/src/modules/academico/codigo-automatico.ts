import type { PoolClient } from 'pg';

const TIPOS = {
  nivel: {
    tabla: 'niveles_educativos',
    columna: 'codigo',
    prefijo: 'NIV',
    digitos: 3,
  },
  curso: { tabla: 'cursos', columna: 'codigo', prefijo: 'CUR', digitos: 4 },
  estudiante: {
    tabla: 'estudiantes',
    columna: 'codigo_estudiante',
    prefijo: 'EST',
    digitos: 6,
  },
} as const;

export async function codigoAutomatico(
  db: PoolClient,
  tipo: keyof typeof TIPOS,
  anio: string | null = null,
) {
  const t = TIPOS[tipo];
  // El bloqueo por escuela y catálogo evita que dos altas reciban el mismo correlativo.
  await db.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('codigo-academico:' || convi.establecimiento_actual()::text || ':' || $1, 0))`,
    [tipo + ':' + (anio ?? '')],
  );
  const r = await db.query<{ siguiente: number }>(
    `SELECT coalesce(max(substring(${t.columna} from $1)::int), 0) + 1 AS siguiente
    FROM convi.${t.tabla} WHERE establecimiento_id = convi.establecimiento_actual()
    ${tipo === 'curso' ? 'AND anio_academico_id = $2::uuid' : ''}`,
    tipo === 'curso'
      ? [`^${t.prefijo}-([0-9]+)$`, anio]
      : [`^${t.prefijo}-([0-9]+)$`],
  );
  return `${t.prefijo}-${String(r.rows[0].siguiente).padStart(t.digitos, '0')}`;
}
