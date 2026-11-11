-- Rendimiento de la seguridad por fila (hallazgo de PB-131): las políticas de
-- convi_backend comprueban la sesión con (SELECT convi.sesion_valida()), que
-- PostgreSQL calcula una vez por consulta y no una vez por fila. Lo que cada
-- escuela puede ver lo comprueba aislamiento_establecimientos.sql.
-- Ejecutar con Supabase local arriba: npx.cmd --yes supabase@2.117.0 test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(5);

-- 1. Cada tabla de convi tiene su política aislamiento_backend.
SELECT is(
  (SELECT count(*) FROM pg_class c
   WHERE c.relnamespace = 'convi'::regnamespace AND c.relkind = 'r'
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                     WHERE p.schemaname = 'convi' AND p.tablename = c.relname
                       AND p.policyname = 'aislamiento_backend')),
  0::bigint,
  'Todas las tablas de convi tienen la política aislamiento_backend');

-- 2. Ninguna política de convi_backend llama a la función fila por fila.
SELECT is(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'convi' AND 'convi_backend' = ANY (roles)
     AND (regexp_replace(coalesce(qual, ''), 'SELECT\s+convi\.sesion_valida\(\)', '', 'g') ~ 'sesion_valida\('
       OR regexp_replace(coalesce(with_check, ''), 'SELECT\s+convi\.sesion_valida\(\)', '', 'g') ~ 'sesion_valida\(')),
  0::bigint,
  'Las políticas de convi_backend calculan la sesión una vez por consulta');

-- 3. Lo único que cambió es la forma de llamar a la función: la condición de
-- la escuela sigue igual, al leer y al escribir, y solo para convi_backend.
SELECT is(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'convi' AND 'convi_backend' = ANY (roles)
     AND NOT (policyname = 'aislamiento_backend' AND cmd = 'ALL' AND permissive = 'PERMISSIVE'
       AND roles = ARRAY['convi_backend']::name[] AND with_check = qual
       AND regexp_replace(qual, '\s+', ' ', 'g') ~
         '^\(\((id|establecimiento_id) = convi\.establecimiento_actual\(\)\) AND \( ?SELECT convi\.sesion_valida\(\)( AS sesion_valida)?\)\)$')),
  0::bigint,
  'Cada política conserva la condición de su escuela al leer y al escribir');

-- 4. Solo la tabla de escuelas se compara por su propio id.
SELECT is(
  (SELECT array_agg(tablename::text ORDER BY tablename) FROM pg_policies
   WHERE schemaname = 'convi' AND policyname = 'aislamiento_backend'
     AND qual ~ '^\(\(id = '),
  ARRAY['establecimientos'],
  'Solo establecimientos usa su id como escuela');

-- 5. El plan de una consulta como la de la API evalúa la sesión una sola vez.
SET LOCAL ROLE convi_backend;
DO $$
DECLARE
  linea text;
  plan_texto text := '';
BEGIN
  FOR linea IN EXECUTE 'EXPLAIN (COSTS OFF) SELECT estado, count(*) FROM convi.situaciones GROUP BY estado' LOOP
    plan_texto := plan_texto || linea || E'\n';
  END LOOP;
  PERFORM set_config('prueba.plan', plan_texto, true);
END $$;
RESET ROLE;
SELECT ok(
  current_setting('prueba.plan') LIKE '%InitPlan%'
  AND current_setting('prueba.plan') NOT LIKE '%Filter: convi.sesion_valida()%',
  'Contar situaciones no llama a sesion_valida() por cada fila');

SELECT * FROM finish();
ROLLBACK;
