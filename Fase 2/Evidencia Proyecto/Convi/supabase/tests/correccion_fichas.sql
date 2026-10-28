-- PB-021 (HU-016): corregir la ficha de un estudiante o la de su contacto
-- conserva la misma persona, deja en la auditoría el valor anterior, el
-- nuevo, quién y cuándo, y no toca matrículas ni vínculos. La regla de no
-- convertir una ficha en la de otra persona está en
-- apps/api/src/modules/academico/correccion-persona.spec.ts.
-- Ejecutar con Supabase local arriba: npx.cmd --yes supabase@2.117.0 test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(11);

-- Datos ficticios: una escuela con su administrador, un curso, una
-- estudiante matriculada y su apoderada.
DO $$
DECLARE
  escuela uuid; admin uuid; anio uuid; nivel uuid; curso uuid;
  persona uuid; estudiante uuid; contacto uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('00000000-0000-4000-8000-0000000003a1', 'admin@correccion.test', now());
  escuela := convi.registrar_primer_administrador(
    '00000000-0000-4000-8000-0000000003a1', 'Ada', 'Corrección', NULL, 'Escuela Corrección');
  SELECT id INTO admin FROM convi.membresias_establecimiento
  WHERE auth_usuario_id = '00000000-0000-4000-8000-0000000003a1';

  INSERT INTO convi.anios_academicos (establecimiento_id, anio, fecha_inicio, fecha_fin, estado)
  VALUES (escuela, 2026, '2026-03-01', '2026-12-18', 'ACTIVO') RETURNING id INTO anio;
  INSERT INTO convi.niveles_educativos (establecimiento_id, codigo, nombre, orden, ciclo, tramo)
  VALUES (escuela, '1M', '1° Medio', 9, 'MEDIA', 'MEDIA_1') RETURNING id INTO nivel;
  INSERT INTO convi.cursos (establecimiento_id, anio_academico_id, codigo, nombre, nivel_id, seccion)
  VALUES (escuela, anio, '1MA', '1° Medio A', nivel, 'A') RETURNING id INTO curso;

  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos, rut)
  VALUES (escuela, 'Sofia', 'Munoz', '12345678-5') RETURNING id INTO persona;
  INSERT INTO convi.estudiantes (establecimiento_id, persona_id, codigo_estudiante)
  VALUES (escuela, persona, 'C-001') RETURNING id INTO estudiante;
  INSERT INTO convi.matriculas (establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en)
  VALUES (escuela, estudiante, curso, anio, '2026-03-01');

  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos, telefono)
  VALUES (escuela, 'Ana', 'Rojas', '+56 9 1111 1111') RETURNING id INTO contacto;
  INSERT INTO convi.apoderados_estudiante (establecimiento_id, estudiante_id, persona_apoderado_id,
    tipo_relacion, es_principal, puede_ser_contactado)
  VALUES (escuela, estudiante, contacto, 'Madre', true, true);

  PERFORM set_config('prueba.escuela', escuela::text, true);
  PERFORM set_config('prueba.admin', admin::text, true);
  PERFORM set_config('prueba.persona', persona::text, true);
  PERFORM set_config('prueba.estudiante', estudiante::text, true);
  PERFORM set_config('prueba.contacto', contacto::text, true);
  -- La auditoría lee quién actúa de app.membresia_id, igual que con la API.
  PERFORM set_config('app.membresia_id', admin::text, true);
END $$;

-- Lo mismo que guarda la API al corregir: los mismos registros, otros valores.
UPDATE convi.personas SET nombres = 'Sofía', apellidos = 'Muñoz'
WHERE id = current_setting('prueba.persona')::uuid;
UPDATE convi.estudiantes SET codigo_estudiante = 'C-002'
WHERE id = current_setting('prueba.estudiante')::uuid;
UPDATE convi.personas SET telefono = '+56 9 2222 2222', direccion = 'Calle Uno 123'
WHERE id = current_setting('prueba.contacto')::uuid;

-- ===== CA1: auditoría con valor anterior, nuevo, quién y cuándo =====

SELECT is(
  (SELECT count(*)::int FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'personas' AND recurso_id = current_setting('prueba.persona')::uuid),
  1,
  'CA1: la corrección de la estudiante queda en la auditoría'
);

SELECT is(
  (SELECT (metadatos->'antes'->>'nombres') || ' ' || (metadatos->'antes'->>'apellidos')
          || ' -> ' || (metadatos->'despues'->>'nombres') || ' ' || (metadatos->'despues'->>'apellidos')
   FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'personas' AND recurso_id = current_setting('prueba.persona')::uuid),
  'Sofia Munoz -> Sofía Muñoz',
  'CA1: guarda el valor anterior y el nuevo'
);

SELECT is(
  (SELECT membresia_actor_id FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'personas' AND recurso_id = current_setting('prueba.persona')::uuid),
  current_setting('prueba.admin')::uuid,
  'CA1: guarda quién corrigió'
);

SELECT is(
  (SELECT ocurrido_en FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'personas' AND recurso_id = current_setting('prueba.persona')::uuid),
  now(),
  'CA1: guarda cuándo se corrigió'
);

SELECT is(
  (SELECT (metadatos->'antes'->>'codigo_estudiante') || ' -> ' || (metadatos->'despues'->>'codigo_estudiante')
   FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'estudiantes' AND recurso_id = current_setting('prueba.estudiante')::uuid),
  'C-001 -> C-002',
  'CA1: el código institucional también queda en la auditoría del mismo estudiante'
);

SELECT is(
  (SELECT persona_id FROM convi.estudiantes WHERE id = current_setting('prueba.estudiante')::uuid),
  current_setting('prueba.persona')::uuid,
  'CA1: el estudiante conserva su identificador y su persona'
);

SELECT is(
  (SELECT (metadatos->'antes'->>'telefono') || ' -> ' || (metadatos->'despues'->>'telefono')
   FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'personas' AND recurso_id = current_setting('prueba.contacto')::uuid),
  '+56 9 1111 1111 -> +56 9 2222 2222',
  'CA1: la corrección del contacto también queda en la auditoría'
);

-- ===== CA4: no cambia matrículas ni vínculos =====

SELECT is(
  (SELECT count(*)::int FROM convi.eventos_auditoria
   WHERE establecimiento_id = current_setting('prueba.escuela')::uuid
     AND tipo_recurso IN ('matriculas', 'apoderados_estudiante')),
  0,
  'CA4: corregir las fichas no modifica matrículas ni vínculos'
);

-- ===== CA3: RUT sin puntos, con guion, válido y único en la escuela =====

SELECT throws_ok(
  $$UPDATE convi.personas SET rut = '12345678-5' WHERE id = current_setting('prueba.contacto')::uuid$$,
  '23505', NULL,
  'CA3: el RUT de otra persona de la escuela no se repite'
);

SELECT throws_ok(
  $$UPDATE convi.personas SET rut = '12345678-9' WHERE id = current_setting('prueba.contacto')::uuid$$,
  '23514', NULL,
  'CA3: rechaza un dígito verificador incorrecto'
);

SELECT throws_ok(
  $$UPDATE convi.personas SET rut = '12.345.678-5' WHERE id = current_setting('prueba.persona')::uuid$$,
  '23514', NULL,
  'CA3: el RUT se guarda sin puntos y con guion'
);

SELECT * FROM finish();
ROLLBACK;
