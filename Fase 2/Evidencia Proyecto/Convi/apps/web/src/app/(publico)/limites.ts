// Límites de los formularios públicos. Los largos máximos son los de las
// columnas de convi.personas en 01_Esquema_Supabase.sql.
export const LARGO_MAXIMO = {
  nombres: 100,
  apellidos: 120,
  correo: 180,
  telefono: 40,
} as const;

// El modelo deja las contraseñas a Supabase Auth: este mínimo tiene que ser el
// mismo que se configure en el proyecto de Supabase.
export const LARGO_MINIMO_CONTRASENA = 8;
