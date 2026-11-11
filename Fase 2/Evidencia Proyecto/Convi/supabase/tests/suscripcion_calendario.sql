-- Refinamientos de Convivencia, sección 5: enlace privado del calendario para
-- Google Calendar. Usa una cuenta activa de Convivencia de los datos locales.
-- Como aislamiento_establecimientos.sql, cada paso corre como convi_backend,
-- guarda su resultado y se comprueba después con el rol de la prueba.
-- Ejecutar con Supabase local arriba: npx.cmd --yes supabase@2.117.0 test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(10);

-- Una cuenta activa de Convivencia de una escuela activa.
SELECT set_config('prueba.membresia', m.id::text, true),
       set_config('prueba.escuela', m.establecimiento_id::text, true),
       set_config('prueba.auth', m.auth_usuario_id::text, true)
FROM convi.membresias_establecimiento m
JOIN convi.establecimientos e ON e.id = m.establecimiento_id
WHERE m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO' AND e.estado = 'ACTIVO'
ORDER BY m.id LIMIT 1;

-- 1. La consulta sin sesión solo la ejecuta la API.
SELECT ok(
  NOT has_function_privilege('anon', 'convi.calendario_suscrito(bytea)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'convi.calendario_suscrito(bytea)', 'EXECUTE')
  AND has_function_privilege('convi_backend', 'convi.calendario_suscrito(bytea)', 'EXECUTE'),
  'Solo convi_backend ejecuta calendario_suscrito');

-- La API con la sesión de esa cuenta: crea el enlace, intenta otro y cambiar la huella.
SELECT set_config('app.auth_usuario_id', current_setting('prueba.auth'), true),
       set_config('app.aal', 'aal2', true),
       set_config('app.membresia_id', current_setting('prueba.membresia'), true),
       set_config('app.establecimiento_id', current_setting('prueba.escuela'), true);
SET LOCAL ROLE convi_backend;
DO $$
BEGIN
  BEGIN
    INSERT INTO convi.suscripciones_calendario(establecimiento_id, membresia_id, huella_token)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.membresia')::uuid,
            sha256('codigo-de-prueba'::bytea));
    PERFORM set_config('prueba.crea', 'ok', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('prueba.crea', SQLSTATE, true);
  END;
  BEGIN
    INSERT INTO convi.suscripciones_calendario(establecimiento_id, membresia_id, huella_token)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.membresia')::uuid,
            sha256('otro-codigo'::bytea));
    PERFORM set_config('prueba.segundo', 'ok', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('prueba.segundo', SQLSTATE, true);
  END;
  BEGIN
    UPDATE convi.suscripciones_calendario SET huella_token = sha256('cambiado'::bytea)
    WHERE membresia_id = current_setting('prueba.membresia')::uuid;
    PERFORM set_config('prueba.cambia', 'ok', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('prueba.cambia', SQLSTATE, true);
  END;
END $$;
RESET ROLE;

-- 2. Crea el enlace de su cuenta.
SELECT is(current_setting('prueba.crea'), 'ok', 'Una cuenta de Convivencia crea su enlace');
-- 3. Solo un enlace activo por cuenta.
SELECT is(current_setting('prueba.segundo'), '23505', 'No hay dos enlaces activos para la misma cuenta');
-- 4. La huella no se cambia.
SELECT is(current_setting('prueba.cambia'), 'P0001', 'El enlace no cambia de huella');

-- Google, sin sesión.
SELECT set_config('app.auth_usuario_id', '', true), set_config('app.aal', '', true),
       set_config('app.membresia_id', '', true), set_config('app.establecimiento_id', '', true);
SET LOCAL ROLE convi_backend;
DO $$
DECLARE
  respuesta jsonb;
BEGIN
  PERFORM set_config('prueba.visibles', (SELECT count(*) FROM convi.suscripciones_calendario)::text, true);
  PERFORM set_config('prueba.desconocido',
    coalesce(convi.calendario_suscrito(sha256('no-existe'::bytea))::text, 'null'), true);
  respuesta := convi.calendario_suscrito(sha256('codigo-de-prueba'::bytea));
  PERFORM set_config('prueba.completo', (respuesta ?& ARRAY['zona_horaria', 'eventos'])::text, true);
  PERFORM set_config('prueba.campos_extra', (
    SELECT count(*) FROM jsonb_array_elements(respuesta->'eventos') e, jsonb_object_keys(e) k
    WHERE k NOT IN ('tipo', 'origen_id', 'caso_id', 'caso_codigo', 'tipo_actuacion',
                    'estado', 'inicio', 'fin', 'dia'))::text, true);
END $$;
RESET ROLE;

-- 5. Sin sesión, la tabla no se ve.
SELECT is(current_setting('prueba.visibles'), '0', 'Sin sesión no se leen los enlaces');
-- 6. Un código que no existe no entrega nada.
SELECT is(current_setting('prueba.desconocido'), 'null', 'Un código desconocido no entrega el calendario');
-- 7. El código correcto entrega la zona horaria y los eventos.
SELECT is(current_setting('prueba.completo'), 'true', 'El código correcto entrega el calendario');
-- 8. Cada evento lleva solo los campos mínimos, sin títulos ni descripciones.
SELECT is(current_setting('prueba.campos_extra'), '0', 'Los eventos no llevan textos libres');

-- La API revoca con la sesión de la cuenta, y Google vuelve a consultar.
SELECT set_config('app.auth_usuario_id', current_setting('prueba.auth'), true),
       set_config('app.aal', 'aal2', true),
       set_config('app.membresia_id', current_setting('prueba.membresia'), true),
       set_config('app.establecimiento_id', current_setting('prueba.escuela'), true);
SET LOCAL ROLE convi_backend;
DO $$
BEGIN
  UPDATE convi.suscripciones_calendario SET revocada_en = now()
  WHERE membresia_id = current_setting('prueba.membresia')::uuid AND revocada_en IS NULL;
  BEGIN
    UPDATE convi.suscripciones_calendario SET revocada_en = NULL
    WHERE membresia_id = current_setting('prueba.membresia')::uuid;
    PERFORM set_config('prueba.reactiva', 'ok', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('prueba.reactiva', SQLSTATE, true);
  END;
  PERFORM set_config('prueba.revocado',
    coalesce(convi.calendario_suscrito(sha256('codigo-de-prueba'::bytea))::text, 'null'), true);
END $$;
RESET ROLE;

-- 9. Un enlace revocado deja de funcionar.
SELECT is(current_setting('prueba.revocado'), 'null', 'Un enlace revocado no entrega el calendario');
-- 10. Un revocado no se reactiva.
SELECT is(current_setting('prueba.reactiva'), 'P0001', 'Un enlace revocado no vuelve a funcionar');

SELECT * FROM finish();
ROLLBACK;
