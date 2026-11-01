"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  enviarArchivo,
  enviarCancelacion,
  enviarConfirmacion,
  enviarCorreccion,
  enviarOmision,
  enviarReanudacion,
  enviarRestauracion,
  enviarRevalidacion,
  enviarRevision,
} from "./datos";

export type EstadoFormulario = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** Lo elegido, para no perderlo si hay errores. El archivo hay que volver a elegirlo. */
  valores?: Record<string, string>;
  /** Lo que se hizo, cuando salió bien. */
  exito?: string;
};

// PB-019 (HU-015 CA1 y CA2): sube el archivo y abre la importación Cargada.
export async function cargarImportacion(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const tipo = formData.get("tipo");
  const archivo = formData.get("archivo");
  const valores = { tipo: typeof tipo === "string" ? tipo : "" };
  if (!(archivo instanceof File) || archivo.size === 0) {
    return {
      mensaje: "Revisa los datos marcados. No se cargó el archivo.",
      errores: { archivo: "Elige un archivo CSV o XLSX." },
      valores,
    };
  }
  const resultado = await enviarArchivo(valores.tipo, archivo);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin/importaciones");
  redirect(`/admin/importaciones/${resultado.id}`);
}

// PB-020 (HU-015 CA3 y CA4): guarda qué campo trae cada columna (los selects
// "mapeo-N" junto al título oculto "columna-N") con el año, el formato de
// fecha y los duplicados, y vuelve a la importación con su vista previa.
export async function revisarImportacion(
  id: string,
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores: Record<string, string> = {};
  for (const [clave, valor] of formData.entries())
    if (typeof valor === "string") valores[clave] = valor;

  const mapeo: Record<string, string> = {};
  for (const [clave, campo] of Object.entries(valores)) {
    const indice = /^mapeo-(\d+)$/.exec(clave)?.[1];
    const columna =
      indice === undefined ? undefined : valores[`columna-${indice}`];
    if (columna !== undefined) mapeo[columna] = campo;
  }
  const resultado = await enviarRevision(id, {
    mapeo,
    anio_academico_id: valores.anio_academico_id || null,
    formato_fecha: valores.formato_fecha ?? "",
    duplicados: valores.duplicados ?? "",
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin/importaciones");
  redirect(`/admin/importaciones/${id}`);
}

// PB-026 y PB-027 (HU-020): pide guardar en las fichas las filas Válidas y,
// si se marcó la casilla, las Con advertencia. La confirmación sigue en
// segundo plano: la página muestra el avance y después el resultado.
export async function confirmarImportacion(
  id: string,
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await enviarConfirmacion(
    id,
    formData.get("incluir_advertencias") === "si",
  );
  revalidatePath("/admin", "layout");
  return resultado.ok ? {} : { mensaje: resultado.mensaje };
}

// PB-027: retoma una confirmación que se detuvo; sigue desde la fila donde
// quedó. No necesita nada del formulario: solo el id de la importación.
export async function reanudarConfirmacion(
  id: string,
): Promise<EstadoFormulario> {
  const resultado = await enviarReanudacion(id);
  revalidatePath("/admin", "layout");
  return resultado.ok ? {} : { mensaje: resultado.mensaje };
}

// PB-026 (HU-020 CA5): las filas Con error no se importan. No necesita
// nada del formulario: solo el id de la importación.
export async function omitirFilas(id: string): Promise<EstadoFormulario> {
  const resultado = await enviarOmision(id);
  revalidatePath("/admin", "layout");
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  return {
    exito:
      resultado.estado === "CONFIRMADO"
        ? "Se omitieron las filas con error y la importación quedó Confirmada."
        : "Se omitieron las filas con error. Quedan filas por confirmar.",
  };
}

// PB-024 (HU-019 CA2 y CA3): guarda lo corregido en una fila (los campos
// "valor-clave") o, con el botón Quitar, la devuelve a los valores del
// archivo. Vuelve a la misma página de la vista previa con el aviso.
export async function corregirFila(
  id: string,
  numero: number,
  volver: string,
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores: Record<string, string> = {};
  for (const [clave, valor] of formData.entries()) {
    const campo = /^valor-(.+)$/.exec(clave)?.[1];
    if (campo && typeof valor === "string") valores[campo] = valor;
  }
  const quitar = formData.get("accion") === "QUITAR";
  const resultado = await enviarCorreccion(id, numero, quitar ? {} : valores);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin", "layout");
  const consulta = new URLSearchParams(volver);
  consulta.set("aviso", quitar ? "sin-correccion" : "corregida");
  consulta.set("fila", String(numero));
  redirect(`/admin/importaciones/${id}?${consulta.toString()}`);
}

// PB-024 (HU-019 CA3): revisa de nuevo las filas abiertas con lo que hay hoy
// en la escuela. No necesita nada del formulario: solo el id.
export async function revalidarFilas(id: string): Promise<EstadoFormulario> {
  const resultado = await enviarRevalidacion(id);
  revalidatePath("/admin", "layout");
  return resultado.ok
    ? { exito: "Se revisaron de nuevo las filas abiertas." }
    : { mensaje: resultado.mensaje };
}

// PB-025 (HU-019 CA4 a CA6): cancela la importación o la restaura a su estado
// anterior, con el motivo que queda en la auditoría.
export async function cambiarCancelacion(
  id: string,
  accion: "cancelar" | "restaurar",
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const motivo = String(formData.get("motivo") ?? "");
  const resultado =
    accion === "cancelar"
      ? await enviarCancelacion(id, motivo)
      : await enviarRestauracion(id, motivo);
  if (!resultado.ok) {
    return {
      mensaje: resultado.mensaje,
      errores: resultado.errores,
      valores: { motivo },
    };
  }
  revalidatePath("/admin", "layout");
  redirect(
    `/admin/importaciones/${id}?aviso=${accion === "cancelar" ? "cancelada" : "restaurada"}`,
  );
}