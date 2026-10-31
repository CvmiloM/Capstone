"use server";

import { redirect } from "next/navigation";
import {
  abrirAvisoEnApi,
  enviarLecturaAviso,
  enviarLecturaTodos,
} from "./datos";

// PB-095 (HU-082): marcar como leído y abrir un aviso propio. Cada formulario
// envía el filtro y la página que se veían para volver a ellos.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function volver(formData: FormData, aviso?: string): never {
  const parametros = new URLSearchParams({
    ver: leerTexto(formData, "ver") === "todos" ? "todos" : "no-leidos",
  });
  const pagina = leerTexto(formData, "pagina");
  if (/^[1-9]\d{0,6}$/.test(pagina)) parametros.set("pagina", pagina);
  if (aviso) parametros.set("aviso", aviso);
  redirect(`/convivencia/avisos?${parametros}`);
}

// CA1: guarda la fecha de lectura; si ya estaba leído, se conserva.
export async function marcarAvisoLeido(formData: FormData) {
  const id = leerTexto(formData, "aviso_id");
  if (!UUID.test(id)) volver(formData, "error");
  const resultado = await enviarLecturaAviso(id);
  volver(formData, resultado.ok ? undefined : "error");
}

export async function marcarTodosLeidos(formData: FormData) {
  const resultado = await enviarLecturaTodos();
  volver(formData, resultado.ok ? "todos-leidos" : "error");
}

// HU-081 CA3 y HU-082 CA2: abrir el aviso lo marca como leído; si su
// registro ya no está disponible, se vuelve a la lista con el aviso.
export async function abrirAviso(formData: FormData) {
  const id = leerTexto(formData, "aviso_id");
  const ruta = UUID.test(id) ? await abrirAvisoEnApi(id) : null;
  if (!ruta) volver(formData, "no-disponible");
  redirect(ruta);
}
