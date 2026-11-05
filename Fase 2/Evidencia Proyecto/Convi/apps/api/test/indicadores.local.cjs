// Ejecutar con Supabase local: docker compose exec api node apps/api/test/indicadores.local.cjs
// Usa la consulta real con tablas temporales y revierte todo; no modifica datos de CONVI.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  assert.ok(['localhost', '127.0.0.1', 'host.docker.internal'].includes(new URL(connectionString).hostname), 'Solo base local');
  const codigo = readFileSync(path.join(__dirname, '../src/modules/situaciones/indicadores.ts'), 'utf8');
  const opciones = codigo.match(/export const OPCIONES_INDICADORES = `([\s\S]+?)`;/)?.[1];
  assert.ok(opciones, 'Opciones de los filtros disponibles');
  const consulta = codigo.match(/export const CONSULTA_INDICADORES = `([\s\S]+?)`;/)?.[1]
    .replace('${OPCIONES_INDICADORES}', opciones);
  assert.ok(consulta, 'Consulta del servidor disponible');
  const db = new Client({ connectionString });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`
      SET LOCAL TIME ZONE 'America/Santiago';
      CREATE TEMP TABLE situaciones (id uuid, ocurrido_en timestamptz, categoria_id uuid, curso_contexto_id uuid, lugar text, caso_id uuid);
      CREATE TEMP TABLE compromisos (estado text, vence_en timestamptz, completado_en timestamptz, caso_id uuid);
      CREATE TEMP TABLE actuaciones (estado text, tipo_actuacion text, programado_en timestamptz, realizado_en timestamptz, caso_id uuid);
      CREATE TEMP TABLE casos (id uuid, estado_actual text, abierto_en timestamptz, cerrado_en timestamptz, fecha_limite_cierre date);
      CREATE TEMP TABLE historial_estados_caso (caso_id uuid, estado_nuevo text, cambiado_en timestamptz);
      CREATE TEMP TABLE categorias_convivencia (id uuid, nombre text, estado text);
      CREATE TEMP TABLE cursos (id uuid, nombre text, anio_academico_id uuid, nivel_id uuid);
      CREATE TEMP TABLE niveles_educativos (id uuid, nombre text);
      CREATE TEMP TABLE estudiantes (id uuid, persona_id uuid);
      CREATE TEMP TABLE participaciones (persona_id uuid, situacion_id uuid, caso_id uuid, activo_hasta timestamptz);
      CREATE TEMP TABLE anios_academicos (id uuid, anio int);
      INSERT INTO casos VALUES
        ('00000000-0000-4000-8000-000000000001','CERRADO','2026-10-30 23:00-03','2026-11-02 00:30-03','2026-11-02'),
        ('00000000-0000-4000-8000-000000000002','REABIERTO','2026-10-29 08:00-03',NULL,NULL);
      INSERT INTO historial_estados_caso VALUES
        ('00000000-0000-4000-8000-000000000001','CERRADO','2026-10-31 10:00-03'),
        ('00000000-0000-4000-8000-000000000001','REABIERTO','2026-11-01 08:00-03'),
        ('00000000-0000-4000-8000-000000000001','CERRADO','2026-11-01 10:00-03'),
        ('00000000-0000-4000-8000-000000000001','REABIERTO','2026-11-01 11:00-03'),
        ('00000000-0000-4000-8000-000000000001','CERRADO','2026-11-02 00:30-03'),
        ('00000000-0000-4000-8000-000000000002','CERRADO','2026-11-01 09:00-03'),
        ('00000000-0000-4000-8000-000000000002','REABIERTO','2026-11-02 09:00-03'),
        ('00000000-0000-4000-8000-000000000002','EN_ANALISIS','2026-11-02 10:00-03'),
        ('00000000-0000-4000-8000-000000000002','CERRADO','2026-11-03 00:00-03');
      INSERT INTO situaciones VALUES
        (gen_random_uuid(),'2026-10-31 23:59-03',NULL,NULL,NULL,NULL),
        (gen_random_uuid(),'2026-11-01 00:00-03',NULL,'00000000-0000-4000-8000-000000000010',NULL,'00000000-0000-4000-8000-000000000001'),
        (gen_random_uuid(),'2026-11-01 08:00-03',NULL,'00000000-0000-4000-8000-000000000010',NULL,'00000000-0000-4000-8000-000000000001'),
        (gen_random_uuid(),'2026-11-02 23:59-03',NULL,NULL,NULL,'00000000-0000-4000-8000-000000000002'),
        (gen_random_uuid(),'2026-11-03 00:00-03',NULL,NULL,NULL,NULL);
    `);
    const consultar = async (desde, hasta, curso = null, categoria = null) =>
      (await db.query(consulta.replaceAll('convi.', 'pg_temp.'), [desde, hasta, curso, categoria, null, null, null])).rows[0];
    const datos = await consultar('2026-11-01', '2026-11-02');
    assert.equal(datos.zona_horaria, 'America/Santiago');
    assert.equal(datos.total_situaciones, 3, 'Límites según día de la escuela');
    assert.equal(datos.comparacion.desde, '2026-10-30');
    assert.equal(datos.comparacion.hasta, '2026-10-31');
    assert.equal(datos.comparacion.dias, 2);
    assert.deepEqual(datos.comparacion.indicadores, [
      { nombre: 'Situaciones', actual: 3, anterior: 1, variacion_porcentual: 200 },
      { nombre: 'Cierres', actual: 3, anterior: 1, variacion_porcentual: 200 },
      { nombre: 'Reaperturas', actual: 3, anterior: 0, variacion_porcentual: null },
    ]);
    assert.deepEqual(datos.gestion, { casos_cerrados: 1, dias_promedio: 3 }, 'Último cierre, incluye días previos a reapertura');
    assert.deepEqual(datos.movimientos, { cierres: 3, casos_con_cierre: 2, reaperturas: 3, casos_reabiertos: 2 });
    assert.deepEqual(datos.cierres, { total: 1, con_plazo: 1, sin_plazo: 0, oportunos: 1, porcentaje_oportunos: 100 }, 'Conserva PB-108');
    for (const campo of ['por_dia', 'por_mes', 'por_categoria', 'por_lugar', 'por_curso','por_nivel'])
      assert.equal(datos[campo].reduce((total, fila) => total + fila.total, 0), datos.total_situaciones, campo);
    assert.equal(datos.por_categoria[0].nombre, 'Sin especificar');
    assert.equal(datos.por_lugar[0].nombre, 'Sin especificar');
    const filtrado = await consultar('2026-11-01', '2026-11-02', '00000000-0000-4000-8000-000000000010');
    assert.equal(filtrado.total_situaciones, 2);
    assert.equal(filtrado.movimientos.cierres, 2, 'Filtro no multiplica cierres por situaciones');
    assert.equal(filtrado.movimientos.casos_con_cierre, 1);
    assert.equal(filtrado.comparacion.indicadores[0].variacion_porcentual, null);
    const vacio = await consultar('2026-11-01', '2026-11-02', null, '00000000-0000-4000-8000-000000000099');
    assert.equal(vacio.total_situaciones, 0);
    assert.deepEqual(vacio.gestion, { casos_cerrados: 0, dias_promedio: null });
    assert.ok(vacio.comparacion.indicadores.every(fila => fila.actual === 0 && fila.anterior === 0 && fila.variacion_porcentual === null));
    const descenso = await consultar('2026-11-04', '2026-11-04');
    assert.equal(descenso.comparacion.indicadores[0].variacion_porcentual, -100);
    const bisiesto = await consultar('2024-03-01', '2024-03-01');
    assert.equal(bisiesto.comparacion.desde, '2024-02-29');
    assert.equal(bisiesto.comparacion.hasta, '2024-02-29');
    const verano = await consultar('2026-09-06', '2026-09-07');
    assert.equal(verano.comparacion.desde, '2026-09-04');
    assert.equal(verano.comparacion.hasta, '2026-09-05');
    assert.equal(verano.comparacion.dias, 2, 'Duración en días calendario incluso con cambio de hora');
    await db.query(`
      INSERT INTO estudiantes VALUES ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000021');
      INSERT INTO participaciones SELECT '00000000-0000-4000-8000-000000000021',id,NULL,NULL
        FROM situaciones WHERE caso_id='00000000-0000-4000-8000-000000000001';
      INSERT INTO participaciones SELECT * FROM participaciones;
      INSERT INTO niveles_educativos VALUES ('00000000-0000-4000-8000-000000000030','Nivel de prueba');
      INSERT INTO cursos VALUES ('00000000-0000-4000-8000-000000000010','Curso de prueba',NULL,'00000000-0000-4000-8000-000000000030');
    `);
    const alumno = (await db.query(consulta.replaceAll('convi.','pg_temp.'),['2026-11-01','2026-11-02',null,null,'00000000-0000-4000-8000-000000000020',null,null])).rows[0];
    assert.equal(alumno.total_situaciones,2,'Participaciones repetidas no multiplican situaciones');
    assert.equal(alumno.movimientos.cierres,2,'Alcance del estudiante conserva los casos correspondientes');
    const caso = (await db.query(consulta.replaceAll('convi.','pg_temp.'),['2026-11-01','2026-11-02',null,null,null,'00000000-0000-4000-8000-000000000001',null])).rows[0];
    assert.equal(caso.total_situaciones,2,'Solo situaciones del caso seleccionado');
    const nivel = (await db.query(consulta.replaceAll('convi.','pg_temp.'),['2026-11-01','2026-11-02',null,null,null,null,'00000000-0000-4000-8000-000000000030'])).rows[0];
    assert.equal(nivel.total_situaciones,2,'Nivel según el curso contextual');
    assert.deepEqual(nivel.por_nivel,[{nombre:'Nivel de prueba',total:2}]);
    assert.equal(nivel.categorias_por_mes.reduce((s,f)=>s+f.total,0),nivel.total_situaciones);
    assert.equal(vacio.cierres.porcentaje_oportunos,null,'No inventa un porcentaje sin denominador');
    console.log('Indicadores: comparación, límites, filtros, último cierre, historial, cero y calendario correctos.');
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
