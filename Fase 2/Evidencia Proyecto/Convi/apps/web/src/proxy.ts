import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, leerConfiguracionSupabase } from "@/lib/supabase/config";

// Renueva la sesión de Supabase Auth antes de cada página y la guarda en
// cookies. No decide permisos: eso lo hace la API en cada operación (PB-127).
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const configuracion = leerConfiguracionSupabase();
  if (!configuracion) return respuesta;

  const supabase = createServerClient(configuracion.url, configuracion.clave, {
    cookieOptions: { name: COOKIE_SESION },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(lista, cabeceras) {
        for (const { name, value } of lista) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of lista) {
          respuesta.cookies.set(name, value, options);
        }
        // Evita que un CDN guarde en caché una respuesta con la sesión.
        for (const [nombre, valor] of Object.entries(cabeceras)) {
          respuesta.headers.set(nombre, valor);
        }
      },
    },
  });

  // Supabase pide no poner código entre crear el cliente y esta llamada.
  await supabase.auth.getClaims();
  return respuesta;
}

export const config = {
  // Todo menos archivos estáticos e imágenes.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};