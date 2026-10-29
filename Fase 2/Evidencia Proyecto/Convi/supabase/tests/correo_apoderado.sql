-- Contrato de acceso de la comprobación global, sin datos personales de salida
-- Salida TAP sin extensiones adicionales, todo se revierte al terminar
BEGIN;
SELECT '1..6';

SELECT CASE WHEN has_function_privilege('convi_backend', 'convi.correo_apoderado_incompatible(text)', 'EXECUTE')
  THEN 'ok 1 - El backend puede invocar la comprobación' ELSE 'not ok 1 - Sin permiso backend' END;
SELECT CASE WHEN NOT has_function_privilege('anon', 'convi.correo_apoderado_incompatible(text)', 'EXECUTE')
  THEN 'ok 2 - El cliente anónimo no puede consultar correos' ELSE 'not ok 2 - Permiso anónimo inesperado' END;
SELECT CASE WHEN NOT has_function_privilege('authenticated', 'convi.correo_apoderado_incompatible(text)', 'EXECUTE')
  THEN 'ok 3 - El cliente autenticado no puede invocarla directamente' ELSE 'not ok 3 - Permiso cliente inesperado' END;
SELECT CASE WHEN (SELECT prosecdef FROM pg_proc WHERE oid='convi.correo_apoderado_incompatible(text)'::regprocedure)
  THEN 'ok 4 - La consulta limitada tiene privilegios propios' ELSE 'not ok 4 - Falta SECURITY DEFINER' END;
SELECT CASE WHEN (SELECT 'search_path=convi, pg_temp'=ANY(proconfig) FROM pg_proc
  WHERE oid='convi.correo_apoderado_incompatible(text)'::regprocedure)
  THEN 'ok 5 - El esquema de resolución está fijado' ELSE 'not ok 5 - search_path inesperado' END;

SELECT set_config('app.auth_usuario_id', '', true), set_config('app.membresia_id', '', true),
  set_config('app.establecimiento_id', '', true), set_config('app.aal', '', true);
SET LOCAL ROLE convi_backend;
DO $$
BEGIN
  PERFORM convi.correo_apoderado_incompatible('prueba@example.test');
  PERFORM set_config('prueba.correo_rechazado', 'false', true);
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM set_config('prueba.correo_rechazado', 'true', true);
END;
$$;
SELECT CASE WHEN current_setting('prueba.correo_rechazado')='true'
  THEN 'ok 6 - El rol backend sin sesión no está autorizado' ELSE 'not ok 6 - Se aceptó una llamada sin sesión' END;
RESET ROLE;
ROLLBACK;
