"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  enviarBienvenida,
  enviarCursosGuia,
  enviarInicioGuia,
  enviarOmision,
  enviarPasoListo,
  enviarTermino,
} from "./datos";
import type { ClavePaso, PasoDelPortal } from "./opciones";

// PB-032 a PB-039: acciones de la guía inicial. Cada formulario envía
// la huella de la guía que se veía, para que la API rechace el cambio si otro
// administrador la avanzó entretanto (PB-139).

export type EstadoGuia = {
  mensaje?: string;
  errores?: Record<string, string>;
  valores?: Record<string, string>;
};

const PASOS_OMITIBLES: ClavePaso[] = [
  "equipo",
  "cursos",
  "reglamento",
  "estudiantes",
  "reglas",
];

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function irAPaso(paso: ClavePaso, aviso?: string): never {
  redirect(`/admin/guia?paso=${paso}${aviso ? `&aviso=${aviso}` : ""}`);
}

// HU-025 CA3 y CA4: guardar la respuesta u omitir la bienvenida.
export async function guardarBienvenida(
  _anterior: EstadoGuia,
  formData: FormData,
): Promise<EstadoGuia> {
  const valores = {
    accion: leerTexto(formData, "accion") === "OMITIR" ? "OMITIR" : "GUARDAR",
    metodo: leerTexto(formData, "metodo"),
    otro: leerTexto(formData, "otro"),
    mejorar: leerTexto(formData, "mejorar"),
  };
  const resultado = await enviarBienvenida({
    ...valores,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  revalidatePath("/admin", "layout");
  irAPaso("equipo", valores.accion === "OMITIR" ? "omitido" : "guardado");
}

// HU-031 CA3: omitir un paso no crea datos ni envía invitaciones.
export async function omitirPaso(formData: FormData) {
  const paso = leerTexto(formData, "paso") as ClavePaso;
  if (!PASOS_OMITIBLES.includes(paso)) irAPaso("bienvenida", "error");
  const resultado = await enviarOmision(paso, leerTexto(formData, "version"));
  if (!resultado.ok) irAPaso(paso, "desactualizada");
  const siguiente =
    PASOS_OMITIBLES[PASOS_OMITIBLES.indexOf(paso) + 1] ?? "fin";
  irAPaso(siguiente, "omitido");
}

// La guía deja de abrirse sola cuando se elige ir al portal por ahora.
export async function irAlPortal(formData: FormData) {
  const resultado = await enviarInicioGuia(leerTexto(formData, "version"));
  if (!resultado.ok) irAPaso("bienvenida", "desactualizada");
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

// PB-034 (HU-027): se envía lo elegido; los nombres y los tramos los pone la
// API. Nada se crea hasta este envío (CA2).
export async function guardarCursos(
  _anterior: EstadoGuia,
  formData: FormData,
): Promise<EstadoGuia> {
  const valores = {
    anio: leerTexto(formData, "anio"),
    fecha_inicio: leerTexto(formData, "fecha_inicio"),
    fecha_fin: leerTexto(formData, "fecha_fin"),
    activar: leerTexto(formData, "activar") === "true" ? "true" : "false",
    niveles: leerTexto(formData, "niveles"),
  };
  let niveles: unknown = [];
  try {
    niveles = JSON.parse(valores.niveles || "[]");
  } catch {
    return { mensaje: "Recarga la página e inténtalo nuevamente.", valores };
  }
  const resultado = await enviarCursosGuia({
    anio: valores.anio,
    fecha_inicio: valores.fecha_inicio,
    fecha_fin: valores.fecha_fin,
    activar: valores.activar === "true",
    niveles,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  // El año activo también se muestra en la tarjeta lateral del portal.
  revalidatePath("/admin", "layout");
  irAPaso("cursos", "cursos-creados");
}

// PB-033 (HU-026), PB-035 (HU-028), PB-036 (HU-029) y PB-037 (HU-030): las
// invitaciones, el reglamento, la nómina y las reglas se hacen con las
// operaciones del portal; el paso queda Listo si ya hay algo hecho (la API lo
// comprueba).
export async function terminarPaso(
  paso: PasoDelPortal,
  _anterior: EstadoGuia,
  formData: FormData,
): Promise<EstadoGuia> {
  const resultado = await enviarPasoListo(paso, leerTexto(formData, "version"));
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidatePath("/admin", "layout");
  if (paso === "equipo") irAPaso("cursos", "equipo-listo");
  if (paso === "reglamento") irAPaso("estudiantes", "reglamento-listo");
  if (paso === "reglas") irAPaso("fin", "reglas-listo");
  irAPaso("reglas", "estudiantes-listo");
}

// PB-039 (HU-032 CA2 y CA3): termina la guía y abre el portal. Si ya estaba
// terminada, la API responde igual y la fecha no cambia.
export async function terminarGuia(
  _anterior: EstadoGuia,
  formData: FormData,
): Promise<EstadoGuia> {
  const resultado = await enviarTermino(leerTexto(formData, "version"));
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidatePath("/admin", "layout");
  redirect("/admin?guia=terminada");
}
