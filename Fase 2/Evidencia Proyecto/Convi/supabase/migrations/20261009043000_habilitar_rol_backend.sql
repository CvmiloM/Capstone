-- PB-127: la conexión local debe poder usar el rol limitado de CONVI.
-- Crear el rol no habilita automáticamente este permiso en PostgreSQL 17.
-- Conservamos las tablas, funciones y restricciones que agregó Camilo.
GRANT convi_backend TO postgres WITH SET TRUE;
