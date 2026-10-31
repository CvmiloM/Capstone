"use server";

import { redirect } from "next/navigation";
import {
  enviarAsignacionPaso,
  enviarAvancePaso,
  enviarEstadoProtocolo,
} from "../datos";
import type { EstadoAccion } from "./acciones";

// PB-055 (HU-048) y PB-056 (HU-049): pasos del protocolo aplicado y término
// del protocolo. Cada formulario envía el caso para volver a él y la versión
// que se veía, para que la API rechace el cambio si otra persona cambió algo
// entretanto (PB-139).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDO = "El caso no es válido. Vuelve a la lista de casos.";
const RECARGAR = "Recarga la página e inténtalo nuevamente.";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function volver(casoId: string, aviso: string, ancla: string): never {
  redirect(
    `/convivencia/casos/${casoId}?seccion=protocolo&aviso=${aviso}#${ancla}`,
  );
}

// CA1, CA3 y CA4: En progreso, Completado u Omitido con su justificación.
export async function avanzarPaso(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const pasoId = leerTexto(formData, "paso_id");
  const valores = {
    estado_nuevo: leerTexto(formData, "estado_nuevo"),
    notas: leerTexto(formData, "notas"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(pasoId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarAvancePaso(pasoId, {
    ...valores,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "paso-avance", `paso-${pasoId}`);
}

// CA1 y CA2: responsable de Convivencia y plazo del paso.
export async function asignarPaso(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const pasoId = leerTexto(formData, "paso_id");
  const valores = {
    responsable_id: leerTexto(formData, "responsable_id"),
    vence_dia: leerTexto(formData, "vence_dia"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(pasoId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarAsignacionPaso(pasoId, {
    ...valores,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "paso-asignado", `paso-${pasoId}`);
}

// HU-049: completar, cancelar o reabrir el protocolo con un motivo.
export async function cambiarEstadoProtocolo(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const protocoloId = leerTexto(formData, "protocolo_id");
  const valores = {
    estado_nuevo: leerTexto(formData, "estado_nuevo"),
    motivo: leerTexto(formData, "motivo"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(protocoloId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarEstadoProtocolo(protocoloId, {
    ...valores,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "protocolo-estado", `protocolo-${protocoloId}`);
}
