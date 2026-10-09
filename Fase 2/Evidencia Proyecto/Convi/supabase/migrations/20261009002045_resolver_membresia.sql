CREATE FUNCTION convi.resolver_membresia()
RETURNS TABLE (
  membresia_id uuid,
  establecimiento_id uuid,
  codigo_perfil varchar,
  requiere_segundo_factor boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = convi, pg_temp
AS $$
  SELECT m.id,
         m.establecimiento_id,
         m.codigo_perfil,
         m.codigo_perfil IN ('ADMIN', 'CONVIVENCIA')
  FROM membresias_establecimiento m
  JOIN establecimientos e ON e.id = m.establecimiento_id
  WHERE m.auth_usuario_id = nullif(current_setting('app.auth_usuario_id', true), '')::uuid
    AND m.estado = 'ACTIVO'
    AND e.estado = 'ACTIVO'
$$;

-- Postgres deja las funciones nuevas ejecutables por PUBLIC si no se revoca.
REVOKE ALL ON FUNCTION convi.resolver_membresia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION convi.resolver_membresia() TO convi_backend;