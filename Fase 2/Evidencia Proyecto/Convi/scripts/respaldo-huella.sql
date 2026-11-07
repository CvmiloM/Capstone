-- PB-133 y PB-134 (HU-114): huella de la base para comparar un respaldo con
-- su restauración. Por cada tabla da las filas y un md5 de su contenido, y
-- cuenta las políticas, triggers, funciones y llaves foráneas de CONVI.
-- Solo lee, la usan scripts/respaldar.ps1 y scripts/ensayar-restauracion.ps1.
SET TimeZone = 'UTC';
SET DateStyle = 'ISO, YMD';
SET IntervalStyle = 'iso_8601';
SET extra_float_digits = 1;

SELECT 'tabla|' || n.nspname || '.' || c.relname || '|' || x.filas || '|' || x.md5
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL (
  SELECT (xpath('/row/f/text()', q))[1]::text AS filas,
         (xpath('/row/h/text()', q))[1]::text AS md5
  FROM query_to_xml(
    format(
      'SELECT count(*) AS f, md5(coalesce(string_agg(t::text, %L ORDER BY t::text), %L)) AS h FROM %I.%I t',
      '|', '', n.nspname, c.relname),
    false, true, '') AS q
) x
WHERE c.relkind IN ('r', 'p')
  AND n.nspname IN ('convi', 'auth', 'storage', 'supabase_migrations', 'public')
ORDER BY 1;

SELECT 'objeto|politicas|' || count(*)
FROM pg_policies WHERE schemaname IN ('convi', 'storage');

SELECT 'objeto|triggers|' || count(*)
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'convi' AND NOT t.tgisinternal;

SELECT 'objeto|funciones|' || count(*)
FROM pg_proc WHERE pronamespace = 'convi'::regnamespace;

SELECT 'objeto|tablas_con_rls|' || count(*)
FROM pg_class WHERE relnamespace = 'convi'::regnamespace AND relrowsecurity;

SELECT 'objeto|llaves_foraneas|' || count(*)
FROM pg_constraint
WHERE contype = 'f' AND connamespace IN ('convi'::regnamespace, 'auth'::regnamespace, 'storage'::regnamespace);

SELECT 'objeto|llaves_foraneas_sin_validar|' || count(*)
FROM pg_constraint
WHERE contype = 'f' AND NOT convalidated
  AND connamespace IN ('convi'::regnamespace, 'auth'::regnamespace, 'storage'::regnamespace);
