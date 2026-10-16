import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { pedirAdmin } from "../datos";
import type { Ciclo } from "./opciones";

// PB-014 (HU-012): niveles educativos del portal de administración. Se piden a
// la API desde el servidor de Next con el token de la sesión; la API vuelve a
// comprobar el perfil ADMIN, el segundo factor y la escuela en cada petición.

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Misma forma que devuelve apps/api/src/modules/academico/niveles.service.ts.
export type NivelEducativo = {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
  ciclo: Ciclo;
  tramo: string;
  activo: boolean;
  /** Cursos de cualquier año que usan el nivel. */
  cursos: number;
};

export type ResultadoNivel =
  | { ok: true; nivel: NivelEducativo }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos guardar el nivel. Inténtalo de nuevo en unos minutos.";

async function tokenDeSesion() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Sin sesión no se llama a la API. La API igual verifica el token en cada petición.
  if (!token) redirect("/login");
  return token;
}

/** Niveles de la escuela de la sesión, en el orden que definió la escuela. */
export async function obtenerNiveles(): Promise<NivelEducativo[]> {
  const respuesta = await pedirAdmin("/admin/niveles");
  // Cualquier otro error lo muestra error.tsx con su botón de reintentar.
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return (await respuesta.json()) as NivelEducativo[];
}

/**
 * Envía un nivel nuevo, una edición o un cambio de activo a la API, que vuelve
 * a validar todo. Los errores se devuelven en vez de lanzarse, para que el
 * formulario no pierda lo que escribió el administrador.
 */
export async function enviarCambio(
  metodo: "POST" | "PATCH",
  ruta: string,
  cuerpo: unknown,
): Promise<ResultadoNivel> {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}/admin/niveles${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) redirect("/login");

  const datos = (await respuesta.json().catch(() => null)) as
    | (Partial<NivelEducativo> & {
        mensaje?: string;
        message?: string;
        errores?: Record<string, string>;
      })
    | null;
  if (respuesta.ok && datos?.id) {
    return { ok: true, nivel: datos as NivelEducativo };
  }
  // HU-012 CA1: la API indica cada campo con problema y no guarda nada.
  if (respuesta.status === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
    };
  }
  // 403, 404 y 409: la API explica qué pasó.
  if ([403, 404, 409].includes(respuesta.status) && datos?.message) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: SIN_CONEXION };
}
