import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  OPCIONES_COOKIE_SESION,
  leerConfiguracionSupabase,
} from "@/lib/supabase/config";
import { consultarCuentaActiva } from "@/lib/supabase/cuenta";

// Renueva la sesión de Supabase Auth antes de cada página y la guarda en
// cookies. Admin comprueba la sesión aquí y autoriza cada lectura en la API;
// Convivencia conserva su control previo. El backend verifica escuela y MFA (PB-127).
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const ruta = request.nextUrl.pathname;
  const perfil = /^\/admin(?:\/|$)/.test(ruta)
    ? "ADMIN"
    : /^\/convivencia(?:\/|$)/.test(ruta)
      ? "CONVIVENCIA"
      : null;
  const configuracion = leerConfiguracionSupabase();
  if (!configuracion) {
    return perfil ? noDisponible() : respuesta;
  }

  const supabase = createServerClient(configuracion.url, configuracion.clave, {
    cookieOptions: OPCIONES_COOKIE_SESION,
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
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (perfil) {
      let destino: string | undefined;
      if (perfil === "ADMIN") {
        // No consultar la base en cada navegación y precarga. Ningún dato se
        // entrega sin los controles de cada endpoint y de admin/datos.ts.
        if (error) return noDisponible();
        if (!data?.claims) destino = "/login";
      } else {
        const consulta = await consultarCuentaActiva(supabase);
        if (consulta.estado === "sin-conexion") return noDisponible();
        if (consulta.estado === "sin-sesion") destino = "/login";
        else if (consulta.estado === "bloqueada")
          destino = "/verificar-segundo-factor";
        else if (consulta.cuenta.codigo_perfil !== perfil) destino = "/";
        else if (consulta.cuenta.segundo_factor_pendiente)
          destino = "/verificar-segundo-factor";
      }
      if (destino) {
        const redireccion = NextResponse.redirect(
          new URL(destino, request.url),
          303,
        );
        // Conservar las cookies renovadas también cuando hay una redirección.
        for (const cookie of respuesta.cookies.getAll())
          redireccion.cookies.set(cookie);
        redireccion.headers.set("Cache-Control", "private, no-store");
        return redireccion;
      }
      respuesta.headers.set("Cache-Control", "private, no-store");
    }
  } catch {
    // Una caída de Auth no debe dejar abierta una página protegida.
    if (perfil) return noDisponible();
    throw new Error("No pudimos comprobar la sesión.");
  }
  return respuesta;
}

function noDisponible() {
  return new NextResponse(
    "No pudimos comprobar tu acceso. Inténtalo nuevamente en unos minutos.",
    {
      status: 503,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
}

export const config = {
  // Todo menos archivos estáticos e imágenes.
  matcher: [
    "/admin/:path*",
    "/convivencia/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
