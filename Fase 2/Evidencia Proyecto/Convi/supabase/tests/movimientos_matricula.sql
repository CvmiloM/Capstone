-- PB-022 y PB-031 (HU-017 y HU-024): al cambiar de curso, pasar de año,
-- egresar o retirarse, la matrícula vigente termina con su fecha y estado, la
-- nueva no comparte días con la anterior, el estudiante conserva su id y cada
-- cambio queda en la auditoría con el antes, el después, quién y el motivo.
-- Las fechas y los tipos de movimiento se prueban en
-- apps/api/src/modules/academico/movimiento-matricula.spec.ts.
-- Ejecutar con Supabase local arriba: npx.cmd --yes supabase@2.117.0 test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(12);

-- Datos ficticios: una escuela con su administrador, los años 2026 y 2027,
-- dos cursos de 1° Medio en 2026, uno de 2° Medio en 2027 y dos estudiantes
-- matriculados en 1° Medio A.
DO $$
DECLARE
  escuela uuid; admin uuid; anio_1 uuid; anio_2 uuid; nivel_1 uuid; nivel_2 uuid;
  curso_a uuid; curso_b uuid; curso_2 uuid; persona uuid; ana uuid; beto uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('00000000-0000-4000-8000-0000000004a1', 'admin@movimientos.test', now());
  escuela := convi.registrar_primer_administrador(
    '00000000-0000-4000-8000-0000000004a1', 'Ada', 'Movimientos', NULL, 'Escuela Movimientos');
  SELECT id INTO admin FROM convi.membresias_establecimiento
  WHERE auth_usuario_id = '00000000-0000-4000-8000-0000000004a1';

  INSERT INTO convi.anios_academicos (establecimiento_id, anio, fecha_inicio, fecha_fin, estado)
  VALUES (escuela, 2026, '2026-03-01', '2026-12-18', 'ACTIVO') RETURNING id INTO anio_1;
  INSERT INTO convi.anios_academicos (establecimiento_id, anio, fecha_inicio, fecha_fin, estado)
  VALUES (escuela, 2027, '2027-03-01', '2027-12-17', 'PLANIFICADO') RETURNING id INTO anio_2;
  INSERT INTO convi.niveles_educativos (establecimiento_id, codigo, nombre, orden, ciclo, tramo)
  VALUES (escuela, '1M', '1° Medio', 9, 'MEDIA', 'MEDIA_1') RETURNING id INTO nivel_1;
  INSERT INTO convi.niveles_educativos (establecimiento_id, codigo, nombre, orden, ciclo, tramo)
  VALUES (escuela, '2M', '2° Medio', 10, 'MEDIA', 'MEDIA_1') RETURNING id INTO nivel_2;
  INSERT INTO convi.cursos (establecimiento_id, anio_academico_id, codigo, nombre, nivel_id, seccion)
  VALUES (escuela, anio_1, '1MA', '1° Medio A', nivel_1, 'A') RETURNING id INTO curso_a;
  INSERT INTO convi.cursos (establecimiento_id, anio_academico_id, codigo, nombre, nivel_id, seccion)
  VALUES (escuela, anio_1, '1MB', '1° Medio B', nivel_1, 'B') RETURNING id INTO curso_b;
  INSERT INTO convi.cursos (establecimiento_id, anio_academico_id, codigo, nombre, nivel_id, seccion)
  VALUES (escuela, anio_2, '2MA', '2° Medio A', nivel_2, 'A') RETURNING id INTO curso_2;

  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Ana', 'Uno')
  RETURNING id INTO persona;
  INSERT INTO convi.estudiantes (establecimiento_id, persona_id, codigo_estudiante)
  VALUES (escuela, persona, 'M-001') RETURNING id INTO ana;
  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Beto', 'Dos')
  RETURNING id INTO persona;
  INSERT INTO convi.estudiantes (establecimiento_id, persona_id, codigo_estudiante)
  VALUES (escuela, persona, 'M-002') RETURNING id INTO beto;
  INSERT INTO convi.matriculas (establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en)
  VALUES (escuela, ana, curso_a, anio_1, '2026-03-01'),
         (escuela, beto, curso_a, anio_1, '2026-03-01');

  PERFORM set_config('prueba.escuela', escuela::text, true);
  PERFORM set_config('prueba.admin', admin::text, true);
  PERFORM set_config('prueba.anio_1', anio_1::text, true);
  PERFORM set_config('prueba.anio_2', anio_2::text, true);
  PERFORM set_config('prueba.curso_a', curso_a::text, true);
  PERFORM set_config('prueba.curso_b', curso_b::text, true);
  PERFORM set_config('prueba.curso_2', curso_2::text, true);
  PERFORM set_config('prueba.ana', ana::text, true);
  PERFORM set_config('prueba.beto', beto::text, true);
  -- La auditoría lee quién actúa y el motivo igual que con la API.
  PERFORM set_config('app.membresia_id', admin::text, true);
END $$;

-- ===== Reglas del modelo para terminar una matrícula =====

SELECT throws_ok(
  $$UPDATE convi.matriculas SET estado = 'RETIRADO'
    WHERE estudiante_id = current_setting('prueba.ana')::uuid$$,
  '23514', NULL,
  'CA1 de HU-024: una matrícula retirada exige su fecha de término'
);

SELECT throws_ok(
  $$INSERT INTO convi.matriculas (establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.ana')::uuid,
            current_setting('prueba.curso_b')::uuid, current_setting('prueba.anio_1')::uuid, '2026-08-03')$$,
  'P0001', 'Matrículas con períodos superpuestos',
  'CA3 de HU-017: no se abre otra matrícula mientras la vigente no termina'
);

-- ===== Cambio de curso de Ana: la anterior termina el día antes =====

DO $$ BEGIN PERFORM set_config('app.motivo_cambio', 'Cambio de jornada', true); END $$;
UPDATE convi.matriculas SET estado = 'TRASLADADO', finalizado_en = '2026-08-02'
WHERE estudiante_id = current_setting('prueba.ana')::uuid AND estado = 'ACTIVO';

SELECT throws_ok(
  $$INSERT INTO convi.matriculas (establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.ana')::uuid,
            current_setting('prueba.curso_b')::uuid, current_setting('prueba.anio_1')::uuid, '2026-08-02')$$,
  'P0001', 'Matrículas con períodos superpuestos',
  'CA3 de HU-017: la nueva matrícula no comparte el último día de la anterior'
);

SELECT lives_ok(
  $$INSERT INTO convi.matriculas (establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.ana')::uuid,
            current_setting('prueba.curso_b')::uuid, current_setting('prueba.anio_1')::uuid, '2026-08-03')$$,
  'CA1 de HU-017: el cambio de curso abre la matrícula nueva al día siguiente'
);

SELECT throws_ok(
  $$INSERT INTO convi.matriculas (establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.beto')::uuid,
            current_setting('prueba.curso_2')::uuid, current_setting('prueba.anio_1')::uuid, '2026-08-03')$$,
  'P0001', 'El curso no pertenece al año',
  'CA3 de HU-017: el curso de destino tiene que ser del año de la matrícula'
);

SELECT is(
  (SELECT string_agg(c.codigo || ' ' || m.estado || ' ' || m.matriculado_en || '/' || coalesce(m.finalizado_en::text, '-'), ', '
                     ORDER BY m.matriculado_en)
   FROM convi.matriculas m JOIN convi.cursos c ON c.id = m.curso_id
   WHERE m.estudiante_id = current_setting('prueba.ana')::uuid),
  '1MA TRASLADADO 2026-03-01/2026-08-02, 1MB ACTIVO 2026-08-03/-',
  'CA2 de HU-017: el estudiante conserva la matrícula anterior y tiene una sola vigente'
);

SELECT is(
  (SELECT (metadatos->'antes'->>'estado') || ' -> ' || (metadatos->'despues'->>'estado')
          || ' | ' || (metadatos->>'motivo')
   FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'matriculas'
     AND metadatos->'antes'->>'estudiante_id' = current_setting('prueba.ana')),
  'ACTIVO -> TRASLADADO | Cambio de jornada',
  'CA5 de HU-017: el término de la matrícula queda en la auditoría con el motivo'
);

SELECT is(
  (SELECT membresia_actor_id FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'matriculas'
     AND metadatos->'antes'->>'estudiante_id' = current_setting('prueba.ana')),
  current_setting('prueba.admin')::uuid,
  'CA5 de HU-017: la auditoría guarda quién cambió la matrícula'
);

-- ===== Paso de año de Beto: la anterior termina el último día de 2026 =====

DO $$ BEGIN PERFORM set_config('app.motivo_cambio', '', true); END $$;
UPDATE convi.matriculas SET estado = 'COMPLETADO', finalizado_en = '2026-12-18'
WHERE estudiante_id = current_setting('prueba.beto')::uuid AND estado = 'ACTIVO';
INSERT INTO convi.matriculas (establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en)
VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.beto')::uuid,
        current_setting('prueba.curso_2')::uuid, current_setting('prueba.anio_2')::uuid, '2027-03-01');

SELECT is(
  (SELECT count(*)::int FROM convi.matriculas
   WHERE estudiante_id = current_setting('prueba.beto')::uuid AND estado = 'ACTIVO'
     AND curso_id = current_setting('prueba.curso_2')::uuid),
  1,
  'CA1 de HU-017: el paso de año deja una sola matrícula vigente en el curso del año siguiente'
);

-- ===== Retiro de Ana: matrícula Retirada y estudiante Inactivo =====

DO $$ BEGIN PERFORM set_config('app.motivo_cambio', 'Cambio de domicilio', true); END $$;
UPDATE convi.matriculas SET estado = 'RETIRADO', finalizado_en = '2026-10-20'
WHERE estudiante_id = current_setting('prueba.ana')::uuid AND estado = 'ACTIVO';
UPDATE convi.estudiantes SET estado = 'INACTIVO' WHERE id = current_setting('prueba.ana')::uuid;

SELECT is(
  (SELECT e.estado || ' con ' || count(m.*) || ' matrículas'
   FROM convi.estudiantes e JOIN convi.matriculas m ON m.estudiante_id = e.id
   WHERE e.id = current_setting('prueba.ana')::uuid GROUP BY e.estado),
  'INACTIVO con 2 matrículas',
  'CA1 y CA3 de HU-024: el estudiante retirado queda Inactivo y conserva sus matrículas'
);

SELECT is(
  (SELECT (metadatos->'antes'->>'estado') || ' -> ' || (metadatos->'despues'->>'estado')
          || ' | ' || (metadatos->>'motivo')
   FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'estudiantes' AND recurso_id = current_setting('prueba.ana')::uuid),
  'ACTIVO -> INACTIVO | Cambio de domicilio',
  'CA1 de HU-024: el cambio de estado del estudiante queda en la auditoría con el motivo'
);

SELECT is(
  (SELECT count(*)::int FROM convi.estudiantes
   WHERE establecimiento_id = current_setting('prueba.escuela')::uuid AND estado = 'ACTIVO'),
  1,
  'CA2 de HU-024: el retirado ya no cuenta entre los estudiantes Activos'
);

SELECT * FROM finish();
ROLLBACK;
