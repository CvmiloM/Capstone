ALTER TABLE convi.reglas
  ADD COLUMN dias_anteriores integer CHECK (
    dias_anteriores IS NULL OR (tipo_regla = 'RECURRENCIA'
      AND dias_anteriores BETWEEN 0 AND 3650 AND ventana_dias IS NULL)
  );

ALTER TABLE convi.reglas DROP CONSTRAINT reglas_coherencia_tipo;
ALTER TABLE convi.reglas ADD CONSTRAINT reglas_coherencia_tipo CHECK (coalesce(CASE tipo_regla
  WHEN 'RECURRENCIA' THEN codigo_metrica='CONTEO_SITUACIONES' AND codigo_ambito IN ('ESTUDIANTE','CURSO','ESTABLECIMIENTO')
    AND codigo_operador IS NOT NULL AND valor_umbral IS NOT NULL AND valor_umbral > 0 AND valor_umbral=trunc(valor_umbral)
    AND ((ventana_dias IS NOT NULL AND ventana_dias > 0) OR dias_anteriores IS NOT NULL)
  WHEN 'VARIACION_PERIODO' THEN codigo_metrica='VARIACION_PORCENTUAL' AND codigo_ambito IN ('ESTUDIANTE','CURSO','ESTABLECIMIENTO')
  WHEN 'FECHA_LIMITE' THEN codigo_metrica='CONTEO_VENCIDOS' AND codigo_ambito='CASO' AND categoria_id IS NULL
    AND codigo_operador IS NOT NULL AND valor_umbral IS NOT NULL AND valor_umbral >= 0 AND valor_umbral=trunc(valor_umbral)
  WHEN 'PLAZO_PROTOCOLO' THEN codigo_metrica='CONTEO_VENCIDOS' AND codigo_ambito='CASO' AND categoria_id IS NULL
    AND codigo_operador IS NOT NULL AND valor_umbral IS NOT NULL AND valor_umbral >= 0 AND valor_umbral=trunc(valor_umbral)
  WHEN 'OTRO' THEN estado<>'ACTIVO'
  END, false));

GRANT SELECT (nombre) ON convi.categorias_convivencia TO convi_motor_reglas;

CREATE OR REPLACE FUNCTION convi.motor_escuelas_con_reglas_diarias() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = convi, pg_temp AS $$
  SELECT e.id FROM establecimientos e
  WHERE e.estado = 'ACTIVO'
    AND EXISTS (
      SELECT 1 FROM reglas r
      WHERE r.establecimiento_id = e.id AND r.estado = 'ACTIVO'
        AND (r.tipo_regla IN ('FECHA_LIMITE', 'PLAZO_PROTOCOLO', 'VARIACION_PERIODO')
          OR (r.tipo_regla = 'RECURRENCIA' AND r.dias_anteriores IS NOT NULL))
    )
  ORDER BY e.id
$$;
