import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { enviar, pedir } from "../datos";

// PB-095 (HU-082): avisos propios de cada profesional de Convivencia. Mismas
// formas que devuelve apps/api/src/modules/alertas/avisos.service.ts.

// Dentro de Docker, localhost no es la API (igual que en ../datos.ts).
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

export type Aviso = {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  creado_en: string;
  leido_en: string | null;
  expira_en: string | null;
  vencido: boolean;
  con_destino: boolean;
};

export type PaginaAvisos = {
  avisos: Aviso[];
  total: number;
  pagina: number;
  limite: number;
  no_leidos: number;
  zona_horaria: string;
};

/** A dónde lleva el aviso; null si su registro ya no se puede abrir. */
type DestinoAviso = {
  tipo: "alerta" | "situacion" | "caso" | "documento";
  id: string;
  seccion?: string;
  ancla?: string;
} | null;

export function obtenerAvisos(filtros: { ver: string; pagina?: string }) {
  const parametros = new URLSearchParams({ ver: filtros.ver });
  if (filtros.pagina) parametros.set("pagina", filtros.pagina);
  return pedir<PaginaAvisos>(`/convivencia/avisos?${parametros}`);
}

export function enviarLecturaAviso(id: string) {
  return enviar("POST", `/convivencia/avisos/${encodeURIComponent(id)}/lectura`);
}

export function enviarLecturaTodos() {
  return enviar("POST", "/convivencia/avisos/lectura");
}

async function tokenDeSesion() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) redirect("/login");
  return token;
}

/**
 * HU-081 CA3: la API marca el aviso como leído, vuelve a comprobar el permiso
 * y responde la ruta del registro, o null si ya no está disponible.
 */
export async function abrirAvisoEnApi(id: string): Promise<string | null> {
  const token = await tokenDeSesion();
  const respuesta = await fetch(
    `${URL_API}/convivencia/avisos/${encodeURIComponent(id)}/apertura`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  ).catch(() => null);
  if (respuesta?.status === 401) redirect("/login");
  if (!respuesta?.ok) return null;
  const { destino } = (await respuesta.json().catch(() => ({}))) as {
    destino?: DestinoAviso;
  };
  return destino ? rutaDelDestino(destino) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECCION = /^[a-z]+$/;
const ANCLA = /^[a-z]+-[0-9a-f-]{36}$/i;

function rutaDelDestino(destino: NonNullable<DestinoAviso>) {
  if (!UUID.test(destino.id)) return null;
  switch (destino.tipo) {
    case "alerta":
      return `/convivencia/alertas/${destino.id}`;
    case "situacion":
      return `/convivencia/situaciones/${destino.id}`;
    case "documento":
      return `/convivencia/documentos/versiones/${destino.id}`;
    case "caso": {
      const seccion =
        destino.seccion && SECCION.test(destino.seccion)
          ? `?seccion=${destino.seccion}`
          : "";
      const ancla =
        destino.ancla && ANCLA.test(destino.ancla) ? `#${destino.ancla}` : "";
      return `/convivencia/casos/${destino.id}${seccion}${ancla}`;
    }
    default:
      return null;
  }
}
