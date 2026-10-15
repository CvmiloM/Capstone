"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enviarArchivo } from "./datos";

export type EstadoFormulario = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** El tipo elegido, para no perderlo si hay errores. El archivo hay que volver a elegirlo. */
  valores?: Record<string, string>;
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