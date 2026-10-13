import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { COOKIE_SESION, leerConfiguracionSupabase } from "./config";

/** Cliente de Supabase Auth para acciones de servidor y Route Handlers. */
export async function crearClienteServidor() {
  // Auth revisa la vigencia de la sesión usando la hora actual. Esperamos la
  // petición del usuario para que esa revisión no ocurra al preparar la página.
  await connection();
  const configuracion = leerConfiguracionSupabase();
  if (!configuracion) {
    throw new Error(
      "Falta configurar SUPABASE_URL o la clave publicable de Supabase en la web.",
    );
  }
  const almacen = await cookies();

  return createServerClient(configuracion.url, configuracion.clave, {
    cookieOptions: { name: COOKIE_SESION },
    cookies: {
      getAll: () => almacen.getAll(),
      setAll(lista) {
        try {
          for (const { name, value, options } of lista) {
            almacen.set(name, value, options);
          }
        } catch {
          // Un Server Component no puede escribir cookies; el proxy renueva la
          // sesión en la siguiente petición.
        }
      },
    },
  });
}
