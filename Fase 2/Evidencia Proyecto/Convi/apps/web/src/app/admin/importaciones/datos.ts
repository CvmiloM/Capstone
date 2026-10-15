import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { obtenerContextoAdmin } from "../datos";
import type { TipoImportacion } from "./opciones";

// PB-019 (HU-015): importaciones del portal de administración. Se piden a la
// API desde el servidor de Next con el token de la sesión; la API vuelve a
// comprobar el perfil ADMIN, el segundo factor y la escuela.

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Mismas formas que devuelve importaciones.service.ts.
export type Importacion = {
  id: string;
  tipo_importacion: TipoImportacion;
  /** CARGADO, PROCESANDO, REVISION, CONFIRMADO, FALLIDO o CANCELADO. */
  estado: string;
  archivo_nombre: string;
  archivo_bytes: number;
  /** Fecha y hora ISO. */
  creado_en: string;
  creado_por: string;
  filas: number;
};

export type DetalleImportacion = Importacion & {
  columnas: string[];
  /** Las primeras 50 filas del archivo, tal como venían. */
  muestra: { numero_fila: number; datos_originales: Record<string, string> }[];
};

export type Resultado =
  | { ok: true; id: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos cargar el archivo. Inténtalo de nuevo en unos minutos.";

async function tokenDeSesion() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Sin sesión no se llama a la API. La API igual verifica el token en cada petición.
  if (!token) redirect("/login");
  return token;
}

// Lecturas: 400 y 404 se devuelven como null (un id que no es de la escuela no
// aparece); cualquier otro error lo muestra error.tsx con su botón de reintentar.
async function pedir<T>(ruta: string): Promise<T | null> {
  // Misma comprobación de acceso que el resto del portal.
  await obtenerContextoAdmin();
  const token = await tokenDeSesion();
  const respuesta = await fetch(`${URL_API}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (respuesta.status === 401) redirect("/login");
  if (respuesta.status === 400 || respuesta.status === 404) return null;
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return (await respuesta.json()) as T;
}

/** Las importaciones de la escuela, la más reciente primero. */
export async function obtenerImportaciones() {
  const importaciones = await pedir<Importacion[]>("/admin/importaciones");
  return importaciones ?? [];
}

/** La importación con sus columnas y sus primeras filas, o null. */
export function obtenerImportacion(id: string) {
  return pedir<DetalleImportacion>(
    `/admin/importaciones/${encodeURIComponent(id)}`,
  );
}

/**
 * Envía el archivo a la API como multipart, igual que un formulario. Los
 * errores se devuelven en vez de lanzarse, para mostrarlos en el formulario.
 */
export async function enviarArchivo(
  tipo: string,
  archivo: File,
): Promise<Resultado> {
  const token = await tokenDeSesion();
  const cuerpo = new FormData();
  cuerpo.set("tipo", tipo);
  cuerpo.set("archivo", archivo, archivo.name);
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}/admin/importaciones`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: cuerpo,
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
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
  // HU-015: la API indica cada campo con problema y no guarda nada.
  if (respuesta.status === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
    };
  }
  // 413: el archivo superó el límite antes de que la API lo leyera.
  if (respuesta.status === 413) {
    return {
      ok: false,
      mensaje: "Revisa los datos marcados.",
      errores: { archivo: "El archivo pesa más de 5 MB." },
    };
  }
  // 403 y 503 (Storage no disponible): la API explica qué pasó.
  if ([403, 503].includes(respuesta.status) && datos?.message) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: SIN_CONEXION };
}