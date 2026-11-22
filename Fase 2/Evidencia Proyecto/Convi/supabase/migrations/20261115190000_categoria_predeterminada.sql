ALTER TABLE convi.categorias_convivencia
  ADD COLUMN predeterminada boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT categoria_predeterminada_activa
    CHECK (NOT predeterminada OR (nombre = 'Ninguna calza' AND estado = 'ACTIVO'));

-- REGLA DE NEGOCIO
-- Cada establecimiento tiene una sola categoría predeterminada llamada «Ninguna calza».
CREATE UNIQUE INDEX una_categoria_predeterminada_por_escuela
  ON convi.categorias_convivencia (establecimiento_id)
  WHERE predeterminada;

-- Conserva los vínculos si la escuela ya tenía una categoría con este nombre.
WITH existentes AS (
  SELECT DISTINCT ON (establecimiento_id) id
  FROM convi.categorias_convivencia
  WHERE lower(btrim(nombre)) = 'ninguna calza'
  ORDER BY establecimiento_id, (estado = 'ACTIVO') DESC, id
)
UPDATE convi.categorias_convivencia c
SET predeterminada = true, nombre = 'Ninguna calza', estado = 'ACTIVO'
FROM existentes e
WHERE c.id = e.id;

INSERT INTO convi.categorias_convivencia (establecimiento_id, nombre, descripcion, predeterminada)
SELECT e.id, 'Ninguna calza', 'Usa esta opción cuando ninguna otra categoría describe la situación o el caso.', true
FROM convi.establecimientos e
WHERE NOT EXISTS (
  SELECT 1 FROM convi.categorias_convivencia c
  WHERE c.establecimiento_id = e.id AND c.predeterminada
);

-- REGLA DE NEGOCIO
-- Cada escuela nueva recibe automáticamente su categoría predeterminada.
CREATE FUNCTION convi.crear_categoria_predeterminada() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO convi.categorias_convivencia (establecimiento_id, nombre, descripcion, predeterminada)
  VALUES (NEW.id, 'Ninguna calza', 'Usa esta opción cuando ninguna otra categoría describe la situación o el caso.', true);
  RETURN NEW;
END;
$$;

CREATE TRIGGER crear_categoria_predeterminada
AFTER INSERT ON convi.establecimientos
FOR EACH ROW EXECUTE FUNCTION convi.crear_categoria_predeterminada();

-- REGLA DE NEGOCIO
-- La categoría «Ninguna calza» permanece disponible para registrar casos o situaciones cuando ninguna otra sirve.
CREATE FUNCTION convi.proteger_categoria_predeterminada() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.predeterminada THEN
    RAISE EXCEPTION 'La categoría predeterminada debe permanecer disponible' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proteger_categoria_predeterminada
BEFORE UPDATE OR DELETE ON convi.categorias_convivencia
FOR EACH ROW EXECUTE FUNCTION convi.proteger_categoria_predeterminada();
