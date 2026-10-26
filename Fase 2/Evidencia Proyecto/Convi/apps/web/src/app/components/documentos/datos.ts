import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { TIPOS } from "./opciones";

const API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";
export type Documento = {
  id: string;
  titulo: string;
  tipo_documento: keyof typeof TIPOS;
  estado: string;
  versiones: number;
  vigente: boolean;
};
export type Version = {
  id: string;
  documento_id: string;
  etiqueta_version: string;
  estado: string;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  publicado_en: string | null;
  vigente: boolean;
  nombre_original: string;
  tipo_mime: string;
  tamano_bytes: number;
  subido_por: string;
  subido_en: string;
  incluir_en_busqueda_ia: boolean;
  estado_procesamiento: string;
  intentos_procesamiento: number;
  detalle_error_procesamiento: string | null;
};
export type Detalle = Documento & { versiones: Version[]; hoy: string };
export type VersionDetalle = Version &
  Pick<Documento, "titulo" | "tipo_documento">;
export type Resultado =
  | { ok: true; id: string; version_id?: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

async function token() {
  const { data } = await (await crearClienteServidor()).auth.getSession();
  if (!data.session) redirect("/login");
  return data.session.access_token;
}
async function pedir(ruta: string, init: RequestInit = {}) {
  const respuesta = await fetch(`${API}/documentos${ruta}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${await token()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
  if (respuesta.status === 401) redirect("/login");
  return respuesta;
}
export async function leer<T>(ruta = ""): Promise<T | null> {
  const r = await pedir(ruta);
  if ([400, 403, 404].includes(r.status)) return null;
  if (!r.ok) throw new Error("No pudimos consultar los documentos");
  return r.json() as Promise<T>;
}
export async function guardar(
  ruta: string,
  cuerpo: FormData | Record<string, string>,
): Promise<Resultado> {
  let r: Response;
  try {
    r = await pedir(
      ruta,
      cuerpo instanceof FormData
        ? { method: "POST", body: cuerpo }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cuerpo),
          },
    );
  } catch (e) {
    // redirect es control de flujo de Next, no un fallo de conexión.
    unstable_rethrow(e);
    return {
      ok: false,
      mensaje:
        "No pudimos conectar, revisa el documento antes de volver a enviarlo",
    };
  }
  const datos = (await r.json().catch(() => null)) as {
    id?: string;
    documento_id?: string;
    version_id?: string;
    mensaje?: string;
    message?: string;
    errores?: Record<string, string>;
  } | null;
  if (r.ok && datos?.id)
    return {
      ok: true,
      id: datos.documento_id ?? datos.id,
      version_id: datos.version_id,
    };
  if (r.status === 413)
    return { ok: false, mensaje: "El archivo supera el límite de 25 MB" };
  return {
    ok: false,
    mensaje:
      datos?.mensaje ?? datos?.message ?? "No pudimos guardar los cambios",
    errores: datos?.errores,
  };
}
export async function archivoVersion(id: string, ver: boolean) {
  const r = await pedir(
    `/versiones/${encodeURIComponent(id)}/archivo${ver ? "?ver=1" : ""}`,
  );
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!r.ok)
    return new Response("El documento no está disponible para esta cuenta", {
      status: [400, 403, 404].includes(r.status) ? 404 : 503,
      headers,
    });
  return new Response(r.body, {
    headers: {
      ...headers,
      "Content-Type":
        r.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition":
        r.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
