// Configuración común de Supabase Auth para el servidor de Next.js (acciones,
// Route Handlers y proxy). La web solo usa Auth: los datos de CONVI se piden
// siempre a la API.

// supabase-js nombra la cookie de sesión según el host de la URL. Dentro de
// Docker el servidor usa host.docker.internal y el navegador localhost, así
// que se fija un nombre común para que ambos lean la misma sesión.
export const COOKIE_SESION = "sb-convi-auth-token";

/** Devuelve null si falta la URL o la clave publicable. */
export function leerConfiguracionSupabase() {
  // Dentro del contenedor, localhost NO apunta a Supabase: el servidor usa
  // SUPABASE_URL y, fuera de Docker, cae en NEXT_PUBLIC_SUPABASE_URL.
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && clave ? { url, clave } : null;
}