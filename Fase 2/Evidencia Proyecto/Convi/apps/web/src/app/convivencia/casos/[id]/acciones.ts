"use server";

import { redirect } from "next/navigation";
import {
  enviarAplicacionProtocolo,
  enviarCambioEstadoCaso,
  enviarCierreCaso,
} from "../../datos";

export type EstadoAccion = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** Lo enviado, para no perderlo si hay errores. */
  valores?: Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDO = "El caso no es válido. Vuelve a la lista de casos.";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-152 (HU-131): mueve el caso a otra etapa con un motivo. Se envía también
// el último movimiento que se veía, para que la API rechace el cambio si otra
// persona cambió el estado entretanto (CA3).
export async function cambiarEstadoCaso(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "caso_id");
  const valores = {
    estado_nuevo: leerTexto(formData, "estado_nuevo"),
    motivo: leerTexto(formData, "motivo_estado"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDO, valores };
  const resultado = await enviarCambioEstadoCaso(id, {
    ...valores,
    movimiento_anterior_id: leerTexto(formData, "movimiento_anterior_id"),
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/casos/${id}?seccion=estado&aviso=estado`);
}

// PB-054 (HU-047): cierra el caso con motivo y resumen; si quedan tareas sin
// terminar, con la justificación de cómo se atenderán (CA2).
export async function cerrarCaso(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "caso_id");
  const valores = {
    motivo: leerTexto(formData, "motivo_cierre"),
    resumen_cierre: leerTexto(formData, "resumen_cierre"),
    justificacion_pendientes: leerTexto(formData, "justificacion_pendientes"),
    evidencia_cierre_id: leerTexto(formData, "evidencia_cierre_id"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDO, valores };
  const resultado = await enviarCierreCaso(id, {
    ...valores,
    movimiento_anterior_id: leerTexto(formData, "movimiento_anterior_id"),
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/casos/${id}?seccion=estado&aviso=cerrado`);
}

// PB-082 (HU-071 CA1): aplica al caso una versión publicada del protocolo
// con su fundamento; la API crea los pasos para el caso.
export async function aplicarProtocolo(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "caso_id");
  const valores = {
    version_protocolo_id: leerTexto(formData, "protocolo_aplicado"),
    fundamento: leerTexto(formData, "fundamento_protocolo"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDO, valores };
  const resultado = await enviarAplicacionProtocolo(id, valores);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/casos/${id}?seccion=protocolo&aviso=protocolo`);
}
