import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { obtenerContextoAdmin } from "../datos";

// PB-013 (HU-011): años académicos del portal de administración. Se piden a la
// API desde el servidor de Next con el token de la sesión; la API vuelve a
// comprobar el perfil ADMIN, el segundo factor y la escuela en cada petición.

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

export type EstadoAnio = "PLANIFICADO" | "ACTIVO" | "CERRADO";

// Misma forma que devuelve apps/api/src/modules/academico/anios.service.ts.
export type AnioAcademico = {
  id: string;
  anio: number;
  /** AAAA-MM-DD, o null si no se indicó. */
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: EstadoAnio;
  /** Cursos creados en el año: con cursos, el número del año ya no cambia. */
  cursos: number;
};

export const NOMBRE_ESTADO: Record<EstadoAnio, string> = {
  PLANIFICADO: "Planificado",
  ACTIVO: "Activo",
  CERRADO: "Cerrado",
};

export type ResultadoAnio =
  | { ok: true; anio: AnioAcademico }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos guardar el año académico. Inténtalo de nuevo en unos minutos.";

async function tokenDeSesion() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Sin sesión no se llama a la API. La API igual verifica el token en cada petición.
  if (!token) redirect("/login");
  return token;
}

/** Años de la escuela de la sesión, del más reciente al más antiguo. */
export async function obtenerAnios(): Promise<AnioAcademico[]> {
  // Misma comprobación de acceso que el resto del portal: sin sesión, sin
  // perfil ADMIN o sin segundo factor, redirige antes de pedir los datos.
  await obtenerContextoAdmin();
  const token = await tokenDeSesion();
  const respuesta = await fetch(`${URL_API}/admin/anios`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (respuesta.status === 401) redirect("/login");
  // Cualquier otro error lo muestra error.tsx con su botón de reintentar.
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return (await respuesta.json()) as AnioAcademico[];
}

/**
 * Envía un año nuevo, una edición o un cambio de estado a la API, que vuelve a
 * validar todo. Los errores se devuelven en vez de lanzarse, para que el
 * formulario no pierda lo que escribió el administrador.
 */
export async function enviarCambio(
  metodo: "POST" | "PATCH",
  ruta: string,
  cuerpo: unknown,
): Promise<ResultadoAnio> {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}/admin/anios${ruta}`, {
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
    | (Partial<AnioAcademico> & {
        mensaje?: string;
        message?: string;
        errores?: Record<string, string>;
      })
    | null;
  if (respuesta.ok && datos?.id) {
    return { ok: true, anio: datos as AnioAcademico };
  }
  // HU-011 CA1 y CA2: la API indica cada campo con problema y no guarda nada.
  if (respuesta.status === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
    };
  }
  // 403, 404 y 409 (otro año activo, un paso no permitido o un año cerrado):
  // la API explica qué pasó.
  if ([403, 404, 409].includes(respuesta.status) && datos?.message) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: SIN_CONEXION };
}