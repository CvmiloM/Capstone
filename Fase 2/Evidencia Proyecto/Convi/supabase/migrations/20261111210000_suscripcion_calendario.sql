-- Refinamientos de Convivencia, sección 5: el calendario de Convivencia se puede
-- suscribir desde Google Calendar u otra aplicación con un enlace privado (.ics).
--
-- Google consulta el enlace desde sus servidores, sin la sesión de la persona,
-- así que el enlace lleva un código secreto. La base guarda solo su huella
-- SHA-256, nunca el código, y cada cuenta tiene a lo más un enlace activo.
-- Lo que sale de CONVI es mínimo: el tipo de evento, el código del caso, la
-- fecha y el estado. No salen títulos, descripciones ni nombres, porque esos
-- textos son libres y pueden nombrar a estudiantes.
--
-- Un enlace deja de funcionar cuando se revoca, cuando la cuenta deja de estar
-- activa o de ser de Convivencia y cuando la escuela deja de estar activa.

CREATE TABLE convi.suscripciones_calendario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  membresia_id uuid NOT NULL,
  huella_token bytea NOT NULL UNIQUE CHECK (octet_length(huella_token) = 32),
  creada_en timestamptz NOT NULL DEFAULT now(),
  revocada_en timestamptz,
  consultada_en timestamptz,
  CONSTRAINT suscripcion_revocada_despues CHECK (revocada_en IS NULL OR revocada_en >= creada_en)
);
ALTER TABLE convi.suscripciones_calendario ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;
ALTER TABLE convi.suscripciones_calendario ADD FOREIGN KEY (establecimiento_id, membresia_id) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;
CREATE INDEX ON convi.suscripciones_calendario (establecimiento_id);
-- Un solo enlace activo por cuenta: crear otro revoca el anterior.
CREATE UNIQUE INDEX suscripcion_calendario_activa ON convi.suscripciones_calendario (membresia_id) WHERE revocada_en IS NULL;

ALTER TABLE convi.suscripciones_calendario ENABLE ROW LEVEL SECURITY;
ALTER TABLE convi.suscripciones_calendario FORCE ROW LEVEL SECURITY;
-- Misma forma que las demás políticas (lo comprueba politicas_sesion_una_vez.sql).
-- La API limita cada consulta a la cuenta de la sesión.
CREATE POLICY aislamiento_backend ON convi.suscripciones_calendario TO convi_backend
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));
GRANT SELECT, INSERT, UPDATE ON convi.suscripciones_calendario TO convi_backend;
REVOKE ALL ON convi.suscripciones_calendario FROM anon, authenticated;

-- Un enlace se crea para una cuenta activa de Convivencia y después solo se
-- revoca o anota su última consulta: no cambia de cuenta, de huella ni de fecha.
CREATE FUNCTION convi.proteger_suscripcion_calendario() RETURNS trigger
LANGUAGE plpgsql SET search_path = convi, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM membresias_establecimiento m
                   WHERE m.id = NEW.membresia_id AND m.establecimiento_id = NEW.establecimiento_id
                     AND m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO') THEN
      RAISE EXCEPTION 'El enlace del calendario es para una cuenta activa de Convivencia';
    END IF;
    NEW.creada_en := now();
    NEW.revocada_en := NULL;
    NEW.consultada_en := NULL;
  ELSIF (NEW.id, NEW.establecimiento_id, NEW.membresia_id, NEW.huella_token, NEW.creada_en)
          IS DISTINCT FROM (OLD.id, OLD.establecimiento_id, OLD.membresia_id, OLD.huella_token, OLD.creada_en)
        OR (OLD.revocada_en IS NOT NULL AND NEW.revocada_en IS DISTINCT FROM OLD.revocada_en) THEN
    RAISE EXCEPTION 'Un enlace del calendario solo se revoca, para cambiarlo crea uno nuevo';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER proteger BEFORE INSERT OR UPDATE ON convi.suscripciones_calendario
  FOR EACH ROW EXECUTE FUNCTION convi.proteger_suscripcion_calendario();

-- La consulta de Google llega sin sesión: esta función recibe la huella del
-- código, comprueba el enlace, la cuenta y la escuela, y entrega solo los
-- campos mínimos de los eventos de esa escuela, los mismos que esa cuenta ve
-- en el calendario (Convivencia ve toda su escuela). Devuelve null si el
-- enlace no sirve. Corre con los permisos de su dueño, que debe ser el
-- propietario de instalación, como sesion_valida, y solo la ejecuta la API.
CREATE FUNCTION convi.calendario_suscrito(p_huella bytea) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = convi, pg_temp AS $$
DECLARE
  s record;
BEGIN
  SELECT x.id, x.establecimiento_id, e.zona_horaria INTO s
  FROM suscripciones_calendario x
  JOIN membresias_establecimiento m ON m.id = x.membresia_id AND m.establecimiento_id = x.establecimiento_id
  JOIN establecimientos e ON e.id = x.establecimiento_id
  WHERE x.huella_token = p_huella AND x.revocada_en IS NULL
    AND m.estado = 'ACTIVO' AND m.codigo_perfil = 'CONVIVENCIA' AND e.estado = 'ACTIVO';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- Para mostrar en CONVI cuándo lo consultó Google, a lo más una vez por hora.
  UPDATE suscripciones_calendario SET consultada_en = now()
  WHERE id = s.id AND (consultada_en IS NULL OR consultada_en < now() - interval '1 hour');
  RETURN jsonb_build_object(
    'zona_horaria', s.zona_horaria,
    'eventos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'tipo', v.tipo, 'origen_id', v.origen_id, 'caso_id', v.caso_id,
               'caso_codigo', c.codigo, 'tipo_actuacion', a.tipo_actuacion,
               'estado', v.estado, 'inicio', v.inicio, 'fin', v.fin,
               'dia', to_char(v.inicio AT TIME ZONE s.zona_horaria, 'YYYY-MM-DD'))
             ORDER BY v.inicio, v.tipo, v.origen_id)
      FROM (SELECT * FROM vw_calendario w
            WHERE w.establecimiento_id = s.establecimiento_id
              AND w.inicio >= now() - interval '60 days'
              AND w.inicio < now() + interval '400 days'
              AND w.estado NOT IN ('CANCELADA', 'CANCELADO', 'OMITIDO')
            ORDER BY w.inicio, w.tipo, w.origen_id
            LIMIT 2000) v
      LEFT JOIN casos c ON c.id = v.caso_id AND c.establecimiento_id = v.establecimiento_id
      LEFT JOIN actuaciones a ON v.tipo = 'ACTUACION' AND a.id = v.origen_id
        AND a.establecimiento_id = v.establecimiento_id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION convi.calendario_suscrito(bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION convi.calendario_suscrito(bytea) TO convi_backend;
