-- PB-094 (HU-081, Fernando): cada mañana el motor de reglas crea los avisos de lo que vence ese día.
-- Corre con la identidad técnica convi_motor_reglas en todas las escuelas activas, tengan o no reglas.
-- Solo agrega permisos de lectura de tres columnas y una función que entrega identificadores;
-- no crea tablas, columnas ni políticas.

-- El aviso de un seguimiento o de un paso va a su responsable, y el título lleva el código del caso.
GRANT SELECT (membresia_responsable_id) ON convi.actuaciones TO convi_motor_reglas;
GRANT SELECT (responsable_id) ON convi.estados_pasos_protocolo_caso TO convi_motor_reglas;
GRANT SELECT (codigo) ON convi.casos TO convi_motor_reglas;

-- Como motor_escuelas_con_reglas_diarias: el motor solo ve la escuela de cada transacción, así que no puede listarlas.
-- Propietario de esta función debe ser el propietario de instalación, como motor_contexto_valido.
CREATE FUNCTION convi.motor_escuelas_activas() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = convi, pg_temp AS $$
  SELECT e.id FROM establecimientos e WHERE e.estado = 'ACTIVO' ORDER BY e.id
$$;
REVOKE ALL ON FUNCTION convi.motor_escuelas_activas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION convi.motor_escuelas_activas() TO convi_motor_reglas;
