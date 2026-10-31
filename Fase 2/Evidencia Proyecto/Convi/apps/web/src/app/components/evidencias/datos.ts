import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// PB-066 (HU-057): envío y descarga de evidencias, compartidos por los
// portales de Convivencia y del profesor. El navegador no tiene el token de
// la sesión: todo pasa por el servidor de Next, y la API vuelve a comprobar
// el perfil, la escuela y el permiso sobre cada registro y cada descarga.

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

export type ResultadoEvidencia =
  | { ok: true }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos adjuntar la evidencia. Revisa tu conexión e inténtalo nuevamente.";

async function tokenDeSesion() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Sin sesión no se llama a la API. La API igual verifica el token en cada petición.
  if (!token) redirect("/login");
  return token;
}

/**
 * Envía el formulario multipart (titulo, tipo, descripcion y archivo) a la
 * API. PB-067: las comunicaciones con respaldo también lo usan, con su propio
 * mensaje si falla la conexión.
 */
export async function enviarEvidencia(
  ruta: string,
  cuerpo: FormData,
  sinConexion = SIN_CONEXION,
): Promise<ResultadoEvidencia> {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: cuerpo,
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    return { ok: false, mensaje: sinConexion };
  }
  if (respuesta.status === 401) redirect("/login");

  const datos = (await respuesta.json().catch(() => null)) as {
    mensaje?: string;
    message?: string;
    errores?: Record<string, string>;
  } | null;
  if (respuesta.ok) return { ok: true };
  // PB-130: la API indica qué falta o por qué rechazó el archivo.
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
      errores: { archivo: "El archivo pesa más de 25 MB." },
    };
  }
  if (respuesta.status === 403) {
    return { ok: false, mensaje: "No tienes permiso para adjuntar aquí." };
  }
  // 404, 409 y 503 traen un mensaje pensado para mostrarse tal cual.
  if ([404, 409, 503].includes(respuesta.status) && datos?.message) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: sinConexion };
}

/**
 * HU-057 CA3: pide el archivo a la API, que vuelve a comprobar el permiso, y
 * lo entrega como descarga. Sin permiso vigente responde 404 sin revelar nada.
 */
export async function responderDescarga(ruta: string) {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    return texto("No pudimos descargar el archivo. Inténtalo de nuevo en unos minutos.", 503);
  }
  if (respuesta.status === 401) redirect("/login");
  if (!respuesta.ok)
    return [400, 403, 404].includes(respuesta.status)
      ? texto("La evidencia no existe o no tienes permiso para descargarla.", 404)
      : texto("No pudimos descargar el archivo. Inténtalo de nuevo en unos minutos.", 503);

  const contenido = await respuesta.arrayBuffer();
  return new Response(contenido, {
    headers: {
      "Content-Type":
        respuesta.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition":
        respuesta.headers.get("Content-Disposition") ?? "attachment",
      "Content-Length": String(contenido.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function texto(mensaje: string, estado: number) {
  return new Response(mensaje, {
    status: estado,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
