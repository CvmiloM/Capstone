-- PB-091 y PB-092 (Camilo): la evaluación de cada mañana recorre las escuelas que tienen reglas diarias.
-- La identidad técnica del motor solo ve la escuela que fija en cada transacción, así que no puede listarlas.
-- Esta función entrega solo los identificadores de las escuelas activas con reglas de vencimientos o de variación activas.
-- No crea tablas, columnas ni políticas, y solo la ejecuta convi_motor_reglas.
-- Propietario de esta función debe ser el propietario de instalación, como motor_contexto_valido.
CREATE FUNCTION convi.motor_escuelas_con_reglas_diarias() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = convi, pg_temp AS $$
  SELECT e.id FROM establecimientos e
  WHERE e.estado = 'ACTIVO'
    AND EXISTS (
      SELECT 1 FROM reglas r
      WHERE r.establecimiento_id = e.id AND r.estado = 'ACTIVO'
        AND r.tipo_regla IN ('FECHA_LIMITE', 'PLAZO_PROTOCOLO', 'VARIACION_PERIODO')
    )
  ORDER BY e.id
$$;
REVOKE ALL ON FUNCTION convi.motor_escuelas_con_reglas_diarias() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION convi.motor_escuelas_con_reglas_diarias() TO convi_motor_reglas;
