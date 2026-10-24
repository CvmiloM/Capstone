"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enviarCambio } from "./datos";

export type EstadoFormulario = {
  /** Error general del formulario o de la acción. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
};

const CAMPOS = [
  "nombre",
  "tipo_regla",
  "codigo_ambito",
  "codigo_operador",
  "valor_umbral",
  "ventana_dias",
  "categoria_id",
  "codigo_accion",
  "codigo_prioridad",
  "vigente_desde",
  "vigente_hasta",
] as const;

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// Las reglas están en los dos portales, cada formulario dice desde cuál viene.
function rutaDelPortal(formData: FormData) {
  return leerTexto(formData, "portal") === "admin"
    ? "/admin/reglas"
    : "/convivencia/reglas";
}

function leerRegla(formData: FormData) {
  return Object.fromEntries(CAMPOS.map((c) => [c, leerTexto(formData, c)]));
}

// Un cambio se ve en los dos portales.
function revalidarPortales() {
  revalidatePath("/admin/reglas", "layout");
  revalidatePath("/convivencia/reglas", "layout");
}

// PB-089 (HU-078 CA6): la regla nueva queda en Borrador.
export async function crearRegla(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await enviarCambio("POST", "", leerRegla(formData));
  if (!resultado.ok) return { mensaje: resultado.mensaje, errores: resultado.errores };
  revalidarPortales();
  redirect(`${rutaDelPortal(formData)}/${encodeURIComponent(resultado.id)}?guardada=1`);
}

// CA6: solo un borrador se edita.
export async function editarRegla(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = leerTexto(formData, "id");
  const resultado = await enviarCambio("PATCH", `/${encodeURIComponent(id)}`, leerRegla(formData));
  if (!resultado.ok) return { mensaje: resultado.mensaje, errores: resultado.errores };
  revalidarPortales();
  redirect(`${rutaDelPortal(formData)}/${encodeURIComponent(id)}?guardada=1`);
}

const RUTA_ACCION = {
  version: "versiones",
  activar: "activacion",
  archivar: "archivo",
} as const;

/**
 * CA6: crear una versión nueva, activar un borrador o archivar. Después de
 * una versión nueva se abre su borrador.
 */
export async function cambiarRegla(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = leerTexto(formData, "id");
  const accion = leerTexto(formData, "accion");
  if (!(accion in RUTA_ACCION)) return { mensaje: "Acción no válida." };
  const resultado = await enviarCambio(
    "POST",
    `/${encodeURIComponent(id)}/${RUTA_ACCION[accion as keyof typeof RUTA_ACCION]}`,
  );
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidarPortales();
  const aviso = accion === "activar" ? "?activada=1" : accion === "archivar" ? "?archivada=1" : "";
  redirect(`${rutaDelPortal(formData)}/${encodeURIComponent(resultado.id)}${aviso}`);
}
