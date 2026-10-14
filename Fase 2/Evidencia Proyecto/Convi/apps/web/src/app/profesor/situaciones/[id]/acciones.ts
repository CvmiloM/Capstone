"use server";

import { redirect } from "next/navigation";
import { enviarRespuesta } from "../../datos";

export type EstadoRespuesta = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error del campo respuesta, si la API lo rechazó. */
  error?: string;
  /** Lo escrito, para no perderlo si hay errores. */
  respuesta?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-049 (HU-042): envía la respuesta a la API, que comprueba que la
// aclaración sea de este profesor y siga pendiente (CA3). Al terminar vuelve
// al detalle, que ya muestra la respuesta guardada y el estado de la situación.
export async function responderAclaracion(
  _anterior: EstadoRespuesta,
  formData: FormData,
): Promise<EstadoRespuesta> {
  const aclaracionId = leerTexto(formData, "aclaracion_id");
  const situacionId = leerTexto(formData, "situacion_id");
  const respuesta = leerTexto(formData, "respuesta");
  if (!UUID.test(aclaracionId) || !UUID.test(situacionId)) {
    return { mensaje: "No puedes responder esta aclaración.", respuesta };
  }

  const resultado = await enviarRespuesta(aclaracionId, respuesta);
  if (!resultado.ok) {
    return {
      mensaje: resultado.mensaje,
      error: resultado.errores?.respuesta,
      respuesta,
    };
  }
  redirect(`/profesor/situaciones/${situacionId}?respondida=1`);
}