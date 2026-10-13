-- PB-141 (HU-120 CA1): aislamiento entre establecimientos.
-- Las claves rechazan relaciones cruzadas entre escuelas y la seguridad por
-- fila (RLS) no entrega datos sin un contexto válido.
-- Ejecutar con Supabase local arriba: npx.cmd --yes supabase@2.117.0 test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(13);

-- Datos ficticios: dos identidades con correo verificado y una escuela cada una.
DO $$
DECLARE
  escuela_a uuid;
  escuela_b uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('00000000-0000-4000-8000-0000000000a1', 'admin.a@aislamiento.test', now()),
    ('00000000-0000-4000-8000-0000000000b1', 'admin.b@aislamiento.test', now());
  escuela_a := convi.registrar_primer_administrador(
    '00000000-0000-4000-8000-0000000000a1', 'Ana', 'Prueba', NULL, 'Escuela A');
  escuela_b := convi.registrar_primer_administrador(
    '00000000-0000-4000-8000-0000000000b1', 'Beto', 'Prueba', NULL, 'Escuela B');
  PERFORM set_config('prueba.escuela_a', escuela_a::text, true);
  PERFORM set_config('prueba.escuela_b', escuela_b::text, true);
  PERFORM set_config('prueba.membresia_a', (SELECT id::text FROM convi.membresias_establecimiento
    WHERE auth_usuario_id = '00000000-0000-4000-8000-0000000000a1'), true);
  PERFORM set_config('prueba.persona_b', (SELECT persona_id::text FROM convi.membresias_establecimiento
    WHERE auth_usuario_id = '00000000-0000-4000-8000-0000000000b1'), true);
END $$;

-- 1. Ninguna tabla del dominio queda sin RLS activada y forzada.
SELECT is(
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'convi' AND c.relkind = 'r'
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity)),
  0::bigint,
  'Todas las tablas de convi tienen seguridad por fila activada y forzada');

-- 2. El navegador (anon y authenticated) no puede leer el esquema convi.
SELECT ok(
  NOT has_schema_privilege('anon', 'convi', 'USAGE')
  AND NOT has_schema_privilege('authenticated', 'convi', 'USAGE'),
  'anon y authenticated no tienen acceso al esquema convi');

-- Las consultas se hacen como convi_backend, el rol que usa la API. Lo que ve
-- se guarda en ajustes locales y se compara después como postgres.

-- 3 y 4. Sin contexto no se devuelven filas.
SET LOCAL ROLE convi_backend;
DO $$ BEGIN
  PERFORM set_config('prueba.sin_contexto_escuelas', (SELECT count(*) FROM convi.establecimientos)::text, true);
  PERFORM set_config('prueba.sin_contexto_personas', (SELECT count(*) FROM convi.personas)::text, true);
END $$;
RESET ROLE;
SELECT is(current_setting('prueba.sin_contexto_escuelas'), '0',
  'Sin contexto no se ve ningún establecimiento');
SELECT is(current_setting('prueba.sin_contexto_personas'), '0',
  'Sin contexto no se ve ninguna persona');

-- 5 a 9. Con la sesión válida del administrador A (segundo factor, aal2).
DO $$ BEGIN
  PERFORM set_config('app.auth_usuario_id', '00000000-0000-4000-8000-0000000000a1', true);
  PERFORM set_config('app.membresia_id', current_setting('prueba.membresia_a'), true);
  PERFORM set_config('app.establecimiento_id', current_setting('prueba.escuela_a'), true);
  PERFORM set_config('app.aal', 'aal2', true);
END $$;
SET LOCAL ROLE convi_backend;
DO $$
DECLARE
  filas integer;
BEGIN
  PERFORM set_config('prueba.a_escuelas', (SELECT string_agg(id::text, ',') FROM convi.establecimientos), true);
  PERFORM set_config('prueba.a_personas_de_b', (SELECT count(*) FROM convi.personas
    WHERE establecimiento_id = current_setting('prueba.escuela_b')::uuid)::text, true);
  UPDATE convi.establecimientos SET nombre = 'Cambio cruzado'
    WHERE id = current_setting('prueba.escuela_b')::uuid;
  GET DIAGNOSTICS filas = ROW_COUNT;
  PERFORM set_config('prueba.a_actualiza_b', filas::text, true);
  BEGIN
    INSERT INTO convi.personas (establecimiento_id, nombres, apellidos)
      VALUES (current_setting('prueba.escuela_b')::uuid, 'Intruso', 'Cruzado');
    PERFORM set_config('prueba.a_inserta_en_b', 'permitido', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('prueba.a_inserta_en_b', SQLSTATE, true);
  END;
END $$;
RESET ROLE;
SELECT is(current_setting('prueba.a_escuelas'), current_setting('prueba.escuela_a'),
  'Con la sesión de A solo se ve la escuela A');
SELECT is(current_setting('prueba.a_personas_de_b'), '0',
  'Con la sesión de A no se ven personas de la escuela B');
SELECT is(current_setting('prueba.a_actualiza_b'), '0',
  'Con la sesión de A no se puede modificar la escuela B');
SELECT is(current_setting('prueba.a_inserta_en_b'), '42501',
  'Con la sesión de A no se puede crear una persona en la escuela B');

-- 9. Contexto alterado: la membresía de A con la escuela B.
DO $$ BEGIN
  PERFORM set_config('app.establecimiento_id', current_setting('prueba.escuela_b'), true);
END $$;
SET LOCAL ROLE convi_backend;
DO $$ BEGIN
  PERFORM set_config('prueba.alterado', (SELECT count(*) FROM convi.establecimientos)::text, true);
END $$;
RESET ROLE;
SELECT is(current_setting('prueba.alterado'), '0',
  'Una membresía con la escuela de otra no ve datos');

-- 10. Administrador sin segundo factor (aal1): no ve datos.
DO $$ BEGIN
  PERFORM set_config('app.establecimiento_id', current_setting('prueba.escuela_a'), true);
  PERFORM set_config('app.aal', 'aal1', true);
END $$;
SET LOCAL ROLE convi_backend;
DO $$ BEGIN
  PERFORM set_config('prueba.sin_segundo_factor', (SELECT count(*) FROM convi.establecimientos)::text, true);
END $$;
RESET ROLE;
SELECT is(current_setting('prueba.sin_segundo_factor'), '0',
  'Un administrador sin segundo factor no ve datos');

-- 11 y 12. Las claves compuestas rechazan relaciones cruzadas incluso sin RLS.
SELECT throws_ok(
  format($sql$INSERT INTO convi.estudiantes (establecimiento_id, persona_id, codigo_estudiante)
             VALUES (%L, %L, 'CRUZADO-1')$sql$,
         current_setting('prueba.escuela_a'), current_setting('prueba.persona_b')),
  '23503', NULL,
  'Un estudiante de la escuela A no puede usar una persona de la escuela B');
SELECT throws_ok(
  format($sql$INSERT INTO convi.membresias_establecimiento
               (establecimiento_id, persona_id, codigo_perfil, estado, correo_invitacion,
                invitado_por, invitado_en)
             VALUES (%L, %L, 'PROFESOR', 'PENDIENTE', 'cruzado@aislamiento.test', %L, now())$sql$,
         current_setting('prueba.escuela_a'), current_setting('prueba.persona_b'),
         current_setting('prueba.membresia_a')),
  '23503', NULL,
  'Una cuenta de la escuela A no puede apuntar a una persona de la escuela B');

-- 13. Lo creado por la prueba se revierte al final.
SELECT is(
  (SELECT count(*) FROM convi.establecimientos WHERE nombre IN ('Escuela A', 'Escuela B')),
  2::bigint,
  'Las dos escuelas ficticias existen solo dentro de esta prueba');

SELECT * FROM finish();
ROLLBACK;