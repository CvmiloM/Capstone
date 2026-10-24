import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { Ambito, EstadoRegla, Tipo } from "./opciones";

// PB-089 (HU-078): reglas de aviso, compartidas por los portales de
// administración y de Convivencia, como las categorías (PB-030). Cada página
// comprueba antes el acceso de su portal y la API vuelve a comprobar el perfil,
// el segundo factor y la escuela.

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Misma forma que devuelve apps/api/src/modules/reglas/reglas.service.ts.
export type Regla = {
  id: string;
  codigo_regla: string;
  numero_version: number;
  nombre: string;
  tipo_regla: Tipo;
  codigo_metrica: string | null;
  codigo_operador: string | null;
  valor_umbral: number | null;
  ventana_dias: number | null;
  ventana_comparacion_dias: number | null;
  categoria_id: string | null;
  categoria: string | null;
  categoria_activa: boolean | null;
  codigo_ambito: Ambito;
  codigo_accion: string;
  codigo_prioridad: string;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  estado: EstadoRegla;
};

export type DetalleRegla = { regla: Regla; versiones: Regla[] };

export type Resultado =
  | { ok: true; id: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos guardar los cambios, inténtalo de nuevo en unos minutos.";

async function tokenDeSesion() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Sin sesión no se llama a la API. La API igual verifica el token en cada petición.
  if (!token) redirect("/login");
  return token;
}

async function leer<T>(ruta: string): Promise<T | null> {
  const token = await tokenDeSesion();
  const respuesta = await fetch(`${URL_API}/reglas${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (respuesta.status === 401) redirect("/login");
  // Una regla que no existe o es de otra escuela se muestra como no encontrada.
  if ([400, 404].includes(respuesta.status)) return null;
  // Cualquier otro error lo muestra error.tsx con su botón de reintentar.
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return (await respuesta.json()) as T;
}

/** Todas las versiones de las reglas de la escuela. */
export async function obtenerReglas(): Promise<Regla[]> {
  return (await leer<Regla[]>("")) ?? [];
}

/** Una versión y todas las de la misma regla, o null si no existe. */
export function obtenerRegla(id: string) {
  return leer<DetalleRegla>(`/${encodeURIComponent(id)}`);
}

/**
 * Envía un cambio a la API, que vuelve a validar todo. Los errores se
 * devuelven en vez de lanzarse, para que el formulario no pierda lo escrito.
 */
export async function enviarCambio(
  metodo: "POST" | "PATCH",
  ruta: string,
  cuerpo?: unknown,
): Promise<Resultado> {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}/reglas${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) redirect("/login");

  const datos = (await respuesta.json().catch(() => null)) as {
    id?: string;
    mensaje?: string;
    message?: string;
    errores?: Record<string, string>;
  } | null;
  if (respuesta.ok && datos?.id) return { ok: true, id: datos.id };
  // HU-078 CA3: la API indica cada campo con problema y no guarda nada.
  if (respuesta.status === 400 && datos?.errores)
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
    };
  // 403, 404 y 409: la API explica qué pasó.
  if ([403, 404, 409].includes(respuesta.status) && datos?.message)
    return { ok: false, mensaje: datos.message };
  return { ok: false, mensaje: SIN_CONEXION };
}
