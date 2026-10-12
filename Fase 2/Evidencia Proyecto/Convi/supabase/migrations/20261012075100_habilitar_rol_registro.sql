-- Adaptación de PB-127 para PB-002: la API local puede completar el registro inicial.
-- El rol ya existe y solo ejecuta las funciones de registro e invitación del modelo.
-- No se conceden permisos de tablas ni se habilita este rol a clientes del navegador.
GRANT convi_registro TO postgres WITH SET TRUE;
