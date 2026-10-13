"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enviarCambio } from "./datos";

export type EstadoFormularioAnio = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** Valores enviados, para no vaciar el formulario si hay errores. */
  valores?: Record<string, string>;
  /** Año recién creado, para confirmarlo sobre el formulario vacío. */
  creado?: number;
};

export type EstadoCambio = { mensaje?: string };

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function leerValores(formData: FormData) {
  return {
    anio: leerTexto(formData, "anio"),
    fecha_inicio: leerTexto(formData, "fecha_inicio"),
    fecha_fin: leerTexto(formData, "fecha_fin"),
  };
}

// La API recibe las fechas vacías como null y valida el año de nuevo.
function cuerpoDe(valores: ReturnType<typeof leerValores>) {
  return {
    anio: valores.anio,
    fecha_inicio: valores.fecha_inicio || null,
    fecha_fin: valores.fecha_fin || null,
  };
}

// PB-013 (HU-011 CA3): el año nuevo queda Planificado; lo asegura la API.
export async function crearAnio(
  _anterior: EstadoFormularioAnio,
  formData: FormData,
): Promise<EstadoFormularioAnio> {
  const valores = leerValores(formData);
  const resultado = await enviarCambio("POST", "", cuerpoDe(valores));
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin/anios");
  return { creado: resultado.anio.anio };
}

// Guarda el año y sus fechas y vuelve al listado.
export async function editarAnio(
  _anterior: EstadoFormularioAnio,
  formData: FormData,
): Promise<EstadoFormularioAnio> {
  const id = leerTexto(formData, "id");
  const valores = leerValores(formData);
  const resultado = await enviarCambio(
    "PATCH",
    `/${encodeURIComponent(id)}`,
    cuerpoDe(valores),
  );
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin/anios");
  redirect("/admin/anios");
}

// Activa o cierra el año. La API solo deja avanzar un paso y tener un año Activo.
export async function cambiarEstadoAnio(
  _anterior: EstadoCambio,
  formData: FormData,
): Promise<EstadoCambio> {
  const id = leerTexto(formData, "id");
  const resultado = await enviarCambio(
    "PATCH",
    `/${encodeURIComponent(id)}/estado`,
    { estado: leerTexto(formData, "estado") },
  );
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidatePath("/admin/anios");
  return {};
}