-- PB-117 (HU-101): la búsqueda del reglamento se ejecuta con los permisos de su dueño.
-- La función usa extensions.vector_dims y el operador de distancia de pgvector, y
-- convi_backend no tiene permiso de uso sobre el esquema extensions, así que como
-- SECURITY INVOKER fallaba con "permission denied for schema extensions". La función
-- ya filtra por la escuela de la sesión, la sesión válida, el perfil Convivencia y las
-- versiones publicadas, vigentes, habilitadas y preparadas, y solo la puede ejecutar
-- la API, así que no se abre el esquema extensions a nadie.
ALTER FUNCTION convi.buscar_fragmentos_normativa(extensions.vector, integer, date) SECURITY DEFINER;
REVOKE ALL ON FUNCTION convi.buscar_fragmentos_normativa(extensions.vector, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION convi.buscar_fragmentos_normativa(extensions.vector, integer, date) TO convi_backend;
