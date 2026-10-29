import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const URL_API = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
export type Estudiante = { id: string; nombre: string; codigo: string };
export type Caso = { id: string; codigo: string; titulo: string; estado: string; fecha_inicio: string; categoria: string | null };
export type Lista<T> = { total: number; pagina: number; por_pagina: number } & T;
export type Registro = { id: string; tipo: string; fecha: string | null; descripcion: string; estado: string | null; archivo: string | null; tamano_bytes: number | null };
export type Detalle = Lista<{ estudiante: Estudiante; caso: Caso & { resumen: string; cerrado_en: string | null }; zona_horaria: string; registros: Registro[] }>;

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
export const obtenerPortal = (pagina: number) => pedir<Lista<{ nombre: string; escuela: string; zona_horaria: string; estudiantes: Estudiante[] }>>(`/apoderado?pagina=${pagina}`);
export const obtenerCasos = (id: string, pagina: number) => pedir<Lista<{ estudiante: Estudiante; casos: Caso[] }>>(`/apoderado/estudiantes/${encodeURIComponent(id)}/casos?pagina=${pagina}`);
export const obtenerDetalle = (id: string, caso: string, pagina: number) => pedir<Detalle>(`/apoderado/estudiantes/${encodeURIComponent(id)}/casos/${encodeURIComponent(caso)}?pagina=${pagina}`);
