"use server";

import { revalidatePath } from "next/cache";
import { enviarCambio } from "./datos";

export type EstadoFormulario = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** Valores enviados, para no vaciar el formulario si hay errores. */
  valores?: Record<string, string>;
  /** Confirmación de lo guardado, sobre el formulario. */
  listo?: string;
};

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function leerCategoria(formData: FormData) {
  return {
    nombre: leerTexto(formData, "nombre"),
    descripcion: leerTexto(formData, "descripcion"),
  };
}

// El catálogo se ve en los dos portales: un cambio actualiza ambas páginas.
function revalidarPortales() {
  revalidatePath("/admin/categorias");
  revalidatePath("/convivencia/categorias");
}

// PB-030 (HU-023 CA1): la categoría nueva queda Activa.
export async function crearCategoria(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = leerCategoria(formData);
  const resultado = await enviarCambio("POST", "", valores);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidarPortales();
  return { listo: `Creaste la categoría "${valores.nombre}".` };
}

// Decisión del PO: el nombre y la descripción cambian siempre.
export async function editarCategoria(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = leerTexto(formData, "id");
  const valores = leerCategoria(formData);
  const resultado = await enviarCambio(
    "PATCH",
    `/${encodeURIComponent(id)}`,
    valores,
  );
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidarPortales();
  return { listo: "Guardaste los cambios de la categoría.", valores };
}

// HU-023 CA2: desactivar o volver a activar. Se puede deshacer.
export async function cambiarEstadoCategoria(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = leerTexto(formData, "id");
  const resultado = await enviarCambio(
    "PATCH",
    `/${encodeURIComponent(id)}/estado`,
    { estado: leerTexto(formData, "estado") },
  );
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidarPortales();
  return {};
}