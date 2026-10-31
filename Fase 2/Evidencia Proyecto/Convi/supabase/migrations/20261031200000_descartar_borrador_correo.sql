-- PB-086 y PB-151 (HU-075 y HU-130), decisión del PO Camilo (2026-10-31): un
-- borrador de correo que nadie confirmó se puede descartar. La API no tenía
-- permiso de borrado en ninguna tabla. Se da solo en comunicaciones y la base
-- rechaza todo lo que no sea un correo en Borrador sin confirmar ni enviar, y
-- deja el descarte en la auditoría con quién lo hizo, sin el texto del correo.

GRANT DELETE ON convi.comunicaciones TO convi_backend;

CREATE FUNCTION convi.descartar_borrador_correo() RETURNS trigger
LANGUAGE plpgsql SET search_path = convi, pg_temp AS $$
BEGIN
  IF OLD.tipo_comunicacion <> 'CORREO'
     OR OLD.estado_entrega <> 'BORRADOR'
     OR OLD.confirmado_en IS NOT NULL
     OR OLD.enviado_en IS NOT NULL
     OR OLD.clave_envio IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se descarta un correo en borrador que nadie confirmó';
  END IF;
  INSERT INTO eventos_auditoria (establecimiento_id, membresia_actor_id, codigo_accion,
    tipo_recurso, recurso_id, codigo_resultado, metadatos)
  VALUES (OLD.establecimiento_id, nullif(current_setting('app.membresia_id', true), '')::uuid,
    'BORRADOR_CORREO_DESCARTADO', 'comunicaciones', OLD.id, 'OK',
    jsonb_build_object('caso_id', OLD.caso_id, 'generado_por_ia', OLD.generado_por_ia,
                       'creado_por', OLD.creado_por));
  RETURN OLD;
END $$;

CREATE TRIGGER descartar_borrador BEFORE DELETE ON convi.comunicaciones
FOR EACH ROW EXECUTE FUNCTION convi.descartar_borrador_correo();
