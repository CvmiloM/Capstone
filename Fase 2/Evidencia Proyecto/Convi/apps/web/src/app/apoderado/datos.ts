import { cache } from "react";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const URL_API = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
export type Estudiante = { id: string; nombre: string; codigo: string };
export type Caso = { id: string; codigo: string; titulo: string; estado: string; fecha_inicio: string; categoria: string | null };
export type Lista<T> = { total: number; pagina: number; por_pagina: number } & T;
export type Registro = { id: string; tipo: string; fecha: string | null; descripcion: string; estado: string | null; archivo: string | null; tamano_bytes: number | null };
export type Detalle = Lista<{ estudiante: Estudiante; caso: Caso & { resumen: string; cerrado_en: string | null }; zona_horaria: string; registros: Registro[] }>;

// Ficha del pupilo: curso de su matrícula vigente, conteos, próxima reunión y
// el permiso de esta cuenta. La usan el menú lateral y varias pantallas.
export type Resumen = {
  apoderado: string;
  apoderado_nombres: string;
  escuela: string;
  zona_horaria: string;
  hoy: string;
  estudiante: Estudiante & { iniciales: string; matricula: string | null; curso: string | null; seccion: string | null; nivel: string | null; anio: number | null; profesor_jefe: string | null };
  conteos: { situaciones: number; casos_activos: number; casos_cerrados: number; encuentros_realizados: number; documentos: number; comunicaciones: number; historial: number };
  proxima_reunion: { id: string; tipo: string; fecha: string; lugar: string | null } | null;
  acceso: { estado: string; otorgado_en: string; expira_en: string | null; tipo_relacion: string | null; es_principal: boolean } | null;
  pupilos: number;
};
export type ListaPupilo<T> = Lista<{ estudiante: string; zona_horaria: string; elementos: T[] }>;
export type DocumentoBreve = { id: string; titulo: string; caso_id: string };
export type Evento = { id: string; tipo: string; fecha: string | null; titulo: string; detalle: string | null; estado: string | null; responsable: string | null; caso_id: string | null; caso_codigo: string | null; documentos: DocumentoBreve[] };
export type Documento = { id: string; titulo: string; tipo: string; fecha: string; caso_id: string; caso_codigo: string; rectifica: boolean; archivo: string; tipo_mime: string; tamano_bytes: number };
export type Reunion = { id: string; tipo: string; estado: string; programado_en: string | null; fin_programado_en: string | null; realizado_en: string | null; fin_real_en: string | null; lugar: string | null; motivo: string; profesional: string | null; caso_id: string; caso_codigo: string; fecha: string; proxima: boolean };
export type Archivo = { id: string; titulo: string; tipo: string; fecha: string; archivo: string; tipo_mime: string; tamano_bytes: number };
export type SituacionBreve = { id: string; codigo: string; fecha: string; lugar: string | null; categoria: string | null; estado: string; relato: string; caso_id: string | null; caso_codigo: string | null; archivos: number; imagenes: number };
export type SituacionDetalle = Omit<SituacionBreve, "archivos" | "imagenes"> & { archivos: Archivo[]; estudiante: string; zona_horaria: string };
export type Comunicacion = { id: string; tipo: string; asunto: string | null; resumen: string; fecha: string; estado: string; caso_id: string; caso_codigo: string; para_usted: boolean };

async function pedir<T>(ruta: string): Promise<T | null> {
  const supabase = await crearClienteServidor();
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) redirect("/login");
  const respuesta = await fetch(`${URL_API}${ruta}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (respuesta.status === 401) redirect("/login");
  if ([400, 403, 404].includes(respuesta.status)) return null;
  if (!respuesta.ok) throw new Error("No pudimos consultar el portal");
  return respuesta.json();
}
export function numeroPagina(valor?: string) {
  const numero = Number(valor ?? 1);
  return Number.isSafeInteger(numero) && numero >= 1 && numero <= 10000 ? numero : 1;
}
const rutaPupilo = (id: string, parte: string) => `/apoderado/estudiantes/${encodeURIComponent(id)}/${parte}`;
export const obtenerPortal = (pagina: number) => pedir<Lista<{ nombre: string; escuela: string; zona_horaria: string; estudiantes: (Estudiante & { iniciales: string })[] }>>(`/apoderado?pagina=${pagina}`);
export const obtenerCasos = (id: string, pagina: number) => pedir<Lista<{ estudiante: Estudiante; casos: Caso[] }>>(`${rutaPupilo(id, "casos")}?pagina=${pagina}`);
export const obtenerDetalle = (id: string, caso: string, pagina: number) => pedir<Detalle>(`${rutaPupilo(id, "casos")}/${encodeURIComponent(caso)}?pagina=${pagina}`);
// Con cache, el menú lateral y la página piden el resumen una sola vez por carga.
export const obtenerResumen = cache((id: string) => pedir<Resumen>(rutaPupilo(id, "resumen")));
export const obtenerHistorial = (id: string, pagina: number) => pedir<ListaPupilo<Evento>>(`${rutaPupilo(id, "historial")}?pagina=${pagina}`);
export const obtenerSituaciones = (id: string, pagina: number) => pedir<ListaPupilo<SituacionBreve>>(`${rutaPupilo(id, "situaciones")}?pagina=${pagina}`);
export const obtenerSituacion = (id: string, situacion: string) => pedir<SituacionDetalle>(`${rutaPupilo(id, "situaciones")}/${encodeURIComponent(situacion)}`);
export const obtenerDocumentos = (id: string, pagina: number) => pedir<ListaPupilo<Documento>>(`${rutaPupilo(id, "documentos")}?pagina=${pagina}`);
export const obtenerReuniones = (id: string, pagina: number) => pedir<ListaPupilo<Reunion>>(`${rutaPupilo(id, "reuniones")}?pagina=${pagina}`);
export const obtenerComunicaciones = (id: string, pagina: number) => pedir<ListaPupilo<Comunicacion>>(`${rutaPupilo(id, "comunicaciones")}?pagina=${pagina}`);
