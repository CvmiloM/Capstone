-- Distingue un registro sin escuela de una cuenta bloqueada o invitada.
-- Solo devuelve un permiso para la identidad comprobada por la API.
CREATE FUNCTION convi.puede_registrar_escuela() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = convi, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = nullif(current_setting('app.auth_usuario_id', true), '')::uuid
      AND u.email_confirmed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM convi.membresias_establecimiento m
        WHERE m.auth_usuario_id = u.id
           OR lower(m.correo_invitacion) = lower(u.email)
      )
  )
$$;
REVOKE ALL ON FUNCTION convi.puede_registrar_escuela() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION convi.puede_registrar_escuela() TO convi_registro;
