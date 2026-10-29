CREATE FUNCTION convi.correo_apoderado_incompatible(p_correo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = convi, pg_temp
AS $$
BEGIN
  IF NOT convi.sesion_valida() OR NOT EXISTS (
    SELECT 1 FROM convi.membresias_establecimiento m
    WHERE m.id = convi.membresia_actual()
      AND m.establecimiento_id = convi.establecimiento_actual()
      AND m.codigo_perfil = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para esta operación' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM convi.membresias_establecimiento m
    JOIN convi.personas p ON p.id = m.persona_id
      AND p.establecimiento_id = m.establecimiento_id
    WHERE m.estado = 'ACTIVO'
      AND m.codigo_perfil IN ('ADMIN', 'CONVIVENCIA', 'PROFESOR')
      AND (lower(m.correo_invitacion) = lower(trim(p_correo))
        OR lower(p.correo) = lower(trim(p_correo)))
  );
END;
$$;

REVOKE ALL ON FUNCTION convi.correo_apoderado_incompatible(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION convi.correo_apoderado_incompatible(text) TO convi_backend;
