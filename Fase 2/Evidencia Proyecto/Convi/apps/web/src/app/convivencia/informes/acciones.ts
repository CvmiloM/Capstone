"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { OpcionInforme } from "./datos";

export type EstadoInforme = { mensaje?: string };
async function pedir(ruta: string, cuerpo?: unknown) {
  const cliente = await crearClienteServidor();
  const { data } = await cliente.auth.getSession();
  if (!data.session) redirect("/login");
  let r: Response;
  try {
    r = await fetch((process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001")+"/convivencia/informes"+ruta,{
      method: cuerpo === undefined ? "GET" : "POST", headers: { Authorization:"Bearer "+data.session.access_token,"Content-Type":"application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),cache:"no-store",signal:AbortSignal.timeout(90000),
    });
  } catch { return { ok:false as const,mensaje:"No pudimos conectar con CONVI, conserva tus opciones y vuelve a intentar" }; }
  if (r.status === 401) redirect("/login");
  const datos = await r.json().catch(()=>null);
  if (!r.ok) return { ok:false as const,mensaje: [400,404,409,503].includes(r.status) && typeof datos?.message === "string" ? datos.message : "No se pudo completar la operación para esta cuenta" };
  return { ok:true as const,datos };
}
export async function buscarRegistroInforme(entrada: { desde: string; hasta: string; tipo: string; buscar: string; pagina: number }): Promise<
  { ok:true; registros: OpcionInforme[]; pagina:number; hay_mas:boolean } | { ok:false; mensaje:string }> {
  const respuesta = await pedir("/buscar?"+new URLSearchParams({ ...entrada,pagina:String(entrada.pagina) }));
  return respuesta.ok ? { ok:true,...respuesta.datos } : respuesta;
}
export async function prepararInforme(_estado: EstadoInforme, formulario: FormData): Promise<EstadoInforme> {
  const entrada = Object.fromEntries(["tipo","desde","hasta","curso","categoria","nivel","estudiante","caso","anterior","solicitud"].map(c=>[c,formulario.get(c)??""]));
  const r = await pedir("/preparar",entrada);
  if (!r.ok) return { mensaje:r.mensaje };
  redirect("/convivencia/informes/"+encodeURIComponent(r.datos.id)+"?paso=contenido");
}
export async function guardarContenidoInforme(id: string,_estado: EstadoInforme,formulario: FormData): Promise<EstadoInforme> {
  const entrada = {
    ...Object.fromEntries(["titulo","subtitulo","comentarios","tema","agrupacion","revision"].map(c=>[c,formulario.get(c)??""])),
    portada:formulario.get("portada")==="on",tablas:formulario.get("tablas")==="on",secciones:formulario.getAll("secciones"),
  };
  const r = await pedir("/"+encodeURIComponent(id)+"/contenido",entrada);
  if (!r.ok) return { mensaje:r.mensaje };
  redirect("/convivencia/informes/"+encodeURIComponent(id));
}
export async function publicarInforme(id: string,_estado: EstadoInforme,formulario: FormData): Promise<EstadoInforme> {
  const r = await pedir("/"+encodeURIComponent(id)+"/publicar",{revision:formulario.get("revision")});
  if (!r.ok) return { mensaje:r.mensaje };
  redirect("/convivencia/informes/"+encodeURIComponent(id));
}
