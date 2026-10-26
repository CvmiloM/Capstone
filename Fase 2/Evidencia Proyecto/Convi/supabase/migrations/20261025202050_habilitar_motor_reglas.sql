-- PB-090 (Camilo): la API evalúa las reglas de cantidad con la identidad técnica del motor.
-- El rol convi_motor_reglas ya existe en el esquema inicial con sus permisos de solo conteo.
-- Igual que convi_backend (PB-127) y convi_registro (PB-002), falta que la conexión de la API pueda asumirlo.
-- No se conceden permisos de tablas nuevos ni se habilita este rol a clientes del navegador.
GRANT convi_motor_reglas TO postgres WITH SET TRUE;
