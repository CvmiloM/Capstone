"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enviarCambio } from "./datos";
import { CICLO_DEL_TRAMO } from "./opciones";

export type EstadoFormularioNivel = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo del formulario. */
  errores?: Record<string, string>;
  /** Valores enviados, para no vaciar el formulario si hay errores. */
  valores?: Record<string, string>;
  /** Código del nivel recién creado, para confirmarlo sobre el formulario vacío. */
  creado?: string;
};

export type EstadoActivo = { mensaje?: string };

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function leerValores(formData: FormData) {
  return {
    codigo: leerTexto(formData, "codigo"),
    nombre: leerTexto(formData, "nombre"),
    orden: leerTexto(formData, "orden"),
    tramo: leerTexto(formData, "tramo"),
  };
}

// El formulario elige solo el tramo; el ciclo sale del tramo, así no pueden
// quedar un ciclo y un tramo que no correspondan. La API valida todo de nuevo.
function cuerpoDe(valores: ReturnType<typeof leerValores>) {
  return { ...valores, ciclo: CICLO_DEL_TRAMO[valores.tramo] ?? "" };
}

// La API marca el ciclo y el tramo por separado; en el formulario son un solo campo.
function erroresDelFormulario(errores?: Record<string, string>) {
  if (!errores) return undefined;
  const { ciclo, ...resto } = errores;
  return ciclo && !resto.tramo ? { ...resto, tramo: ciclo } : resto;
}

// PB-014 (HU-012): un nivel nuevo queda activo.
export async function crearNivel(
  _anterior: EstadoFormularioNivel,
  formData: FormData,
): Promise<EstadoFormularioNivel> {
  const valores = leerValores(formData);
  const resultado = await enviarCambio("POST", "", cuerpoDe(valores));
  if (!resultado.ok) {
    return {
      mensaje: resultado.mensaje,
      errores: erroresDelFormulario(resultado.errores),
      valores,
    };
  }
  revalidatePath("/admin/niveles");
  return { creado: resultado.nivel.codigo };
}

// Guarda el nivel y vuelve al listado.
export async function editarNivel(
  _anterior: EstadoFormularioNivel,
  formData: FormData,
): Promise<EstadoFormularioNivel> {
  const id = leerTexto(formData, "id");
  const valores = leerValores(formData);
  const resultado = await enviarCambio(
    "PATCH",
    `/${encodeURIComponent(id)}`,
    cuerpoDe(valores),
  );
  if (!resultado.ok) {
    return {
      mensaje: resultado.mensaje,
      errores: erroresDelFormulario(resultado.errores),
      valores,
    };
  }
  revalidatePath("/admin/niveles");
  redirect("/admin/niveles");
}

// CA2: desactivar saca el nivel de los cursos nuevos; decisión del PO: se
// puede volver a activar.
export async function cambiarActivoNivel(
  _anterior: EstadoActivo,
  formData: FormData,
): Promise<EstadoActivo> {
  const id = leerTexto(formData, "id");
  const resultado = await enviarCambio(
    "PATCH",
    `/${encodeURIComponent(id)}/activo`,
    { activo: leerTexto(formData, "activo") === "true" },
  );
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidatePath("/admin/niveles");
  return {};
}