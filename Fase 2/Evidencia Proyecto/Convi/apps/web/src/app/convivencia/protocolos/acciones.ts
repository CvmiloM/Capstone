"use server";

import { redirect } from "next/navigation";
import {
  enviarCambioPaso,
  enviarDatosVersion,
  enviarNuevaVersion,
  enviarPaso,
  enviarProtocolo,
  enviarPublicacion,
} from "./datos";

export type EstadoAccion = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** Lo enviado, para no perderlo si hay errores. */
  valores?: Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDO = "El protocolo no es válido. Vuelve a la lista de protocolos.";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-081 (HU-070 CA1): crea el protocolo con su versión 1 en Borrador.
export async function crearProtocolo(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const valores = {
    codigo: leerTexto(formData, "codigo"),
    nombre: leerTexto(formData, "nombre"),
  };
  const resultado = await enviarProtocolo(valores);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/protocolos/${resultado.id}?aviso=creado`);
}

// HU-070 CA5: versión nueva en Borrador, con los pasos de la anterior.
export async function crearVersion(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const protocoloId = leerTexto(formData, "protocolo_id");
  if (!UUID.test(protocoloId)) return { mensaje: NO_VALIDO };
  const resultado = await enviarNuevaVersion(protocoloId);
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  redirect(`/convivencia/protocolos/versiones/${resultado.id}?aviso=version`);
}

// HU-070 CA1: documento de origen y notas de la versión en Borrador.
export async function guardarDatosVersion(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "version_id");
  const valores = {
    version_documento_origen_id: leerTexto(formData, "version_documento_origen_id"),
    notas: leerTexto(formData, "notas"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDO, valores };
  const resultado = await enviarDatosVersion(id, valores);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/protocolos/versiones/${id}?aviso=datos`);
}

// HU-070 CA2 y CA4: agrega un paso o, si trae paso_id, lo edita.
export async function guardarPaso(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const versionId = leerTexto(formData, "version_id");
  const pasoId = leerTexto(formData, "paso_id");
  const valores = {
    orden_paso: leerTexto(formData, "orden_paso"),
    nombre: leerTexto(formData, "nombre_paso"),
    descripcion: leerTexto(formData, "descripcion_paso"),
    valor_plazo: leerTexto(formData, "valor_plazo"),
    unidad_plazo: leerTexto(formData, "unidad_plazo"),
    requiere_evidencia: formData.get("requiere_evidencia") ? "on" : "",
    es_obligatorio: formData.get("es_obligatorio") ? "on" : "",
  };
  if (!UUID.test(versionId) || (pasoId && !UUID.test(pasoId)))
    return { mensaje: NO_VALIDO, valores };
  const resultado = pasoId
    ? await enviarCambioPaso(pasoId, valores)
    : await enviarPaso(versionId, valores);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/protocolos/versiones/${versionId}?aviso=paso`);
}

// PB-083 (HU-072): publica la versión. La API exige pasos y documento de
// origen, y la base guarda quién la revisó y cuándo.
export async function publicarVersion(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "version_id");
  const valores = { vigente_desde: leerTexto(formData, "vigente_desde") };
  if (!UUID.test(id)) return { mensaje: NO_VALIDO, valores };
  const resultado = await enviarPublicacion(id, valores);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/protocolos/versiones/${id}?aviso=publicada`);
}
