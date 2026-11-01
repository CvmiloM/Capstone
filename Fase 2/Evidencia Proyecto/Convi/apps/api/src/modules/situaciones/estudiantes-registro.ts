import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';

export function leerBusquedaEstudiantes(consulta: Record<string, unknown>) {
  const buscar = consulta.buscar === undefined ? '' : consulta.buscar;
  const curso = consulta.curso === undefined ? '' : consulta.curso;
  if (
    typeof buscar !== 'string' ||
    buscar.length > 100 ||
    typeof curso !== 'string' ||
    (curso &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        curso,
      )) ||
    ![undefined, '', '0', '1'].includes(
      consulta.historico as string | undefined,
    )
  )
    throw new BadRequestException('Revisa la búsqueda de estudiantes');
  return {
    buscar: buscar.trim(),
    curso: curso || null,
    historico: consulta.historico === '1',
  };
}

export async function buscarEstudiantesRegistro(
  db: PoolClient,
  filtro: ReturnType<typeof leerBusquedaEstudiantes>,
) {
  if (filtro.buscar.length < 2 && !filtro.curso)
    return { estudiantes: [], hay_mas: false };
  // Evita compilar con JIT un plan costoso por las políticas de acceso, solo en esta transacción.
  await db.query('SET LOCAL jit = off');
  const literal = filtro.buscar.replace(/[\\%_]/g, '\\$&');
  const rut = filtro.buscar.replace(/[.\s-]/g, '').toUpperCase();
  const resultado = await db.query(
    `WITH estudiantes AS MATERIALIZED (
      SELECT id, persona_id, codigo_estudiante, estado FROM convi.estudiantes
      WHERE establecimiento_id = (SELECT convi.establecimiento_actual())
    ), personas AS MATERIALIZED (
      SELECT id, nombres, apellidos, rut FROM convi.personas
      WHERE establecimiento_id = (SELECT convi.establecimiento_actual())
    ), matriculas AS MATERIALIZED (
      SELECT estudiante_id, curso_id FROM convi.matriculas
      WHERE establecimiento_id = (SELECT convi.establecimiento_actual()) AND estado = 'ACTIVO'
    ), cursos AS MATERIALIZED (
      SELECT id, nombre FROM convi.cursos
      WHERE establecimiento_id = (SELECT convi.establecimiento_actual())
    )
    SELECT e.id, e.persona_id, p.nombres, p.apellidos, p.rut,
    e.codigo_estudiante, actual.nombre AS curso
    FROM estudiantes e JOIN personas p ON p.id = e.persona_id
    LEFT JOIN matriculas m ON m.estudiante_id = e.id
    LEFT JOIN cursos actual ON actual.id = m.curso_id
    WHERE ($3::boolean OR (e.estado = 'ACTIVO' AND actual.id IS NOT NULL))
      AND ($2::uuid IS NULL OR actual.id = $2)
      AND ($1 = '%%' OR translate(p.nombres || ' ' || p.apellidos, 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')
        ILIKE translate($1, 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu') OR e.codigo_estudiante ILIKE $1
        OR ($4 <> '' AND replace(p.rut, '-', '') LIKE $4 || '%'))
    ORDER BY p.nombres, p.apellidos, e.id LIMIT 21`,
    [
      `%${literal}%`,
      filtro.curso,
      filtro.historico,
      /^[0-9K]+$/.test(rut) ? rut : '',
    ],
  );
  return {
    estudiantes: resultado.rows.slice(0, 20),
    hay_mas: resultado.rows.length > 20,
  };
}
