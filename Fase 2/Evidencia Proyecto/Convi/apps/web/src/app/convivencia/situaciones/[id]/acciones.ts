"use server";

import { redirect } from "next/navigation";
import {
  enviarAclaracion,
  enviarCambioResponsable,
  enviarCambioUrgencia,
  enviarInicioRevision,
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
const NO_VALIDA = "La situación no es válida. Vuelve a la bandeja.";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-044 (HU-037 CA2): pasa una situación Nueva a En revisión. La API
// comprueba el perfil, la escuela y el estado actual.
export async function iniciarRevision(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  if (!UUID.test(id)) return { mensaje: NO_VALIDA };
  const resultado = await enviarInicioRevision(id);
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  redirect(`/convivencia/situaciones/${id}?aviso=revision`);
}

// PB-044 (HU-037 CA3): cambia la urgencia con un motivo. Se envía también la
// urgencia que se veía, para que la API rechace el cambio si otra persona la
// modificó entretanto (PB-139).
export async function cambiarUrgencia(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  const valores = {
    urgencia: leerTexto(formData, "urgencia"),
    motivo: leerTexto(formData, "motivo"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDA, valores };
  const resultado = await enviarCambioUrgencia(id, {
    ...valores,
    urgencia_anterior: leerTexto(formData, "urgencia_anterior"),
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/situaciones/${id}?aviso=urgencia`);
}

// PB-046 (HU-039): asigna o cambia a quien revisa la situación. Se envía
// también el responsable que se veía, para que la API rechace el cambio si
// otra persona lo modificó entretanto (CA2). El estado no cambia (CA4).
export async function asignarResponsable(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  const valores = {
    responsable_id: leerTexto(formData, "responsable_id"),
    motivo: leerTexto(formData, "motivo"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDA, valores };
  const resultado = await enviarCambioResponsable(id, {
    ...valores,
    responsable_anterior_id: leerTexto(formData, "responsable_anterior_id"),
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/situaciones/${id}?aviso=responsable`);
}

// PB-045 (HU-038): pide información al profesor que registró la situación.
// La API guarda la pregunta y pasa la situación a Información solicitada en
// la misma operación; el profesor la responde desde sus registros (PB-049).
export async function pedirAclaracion(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  const valores = { pregunta: leerTexto(formData, "pregunta") };
  if (!UUID.test(id)) return { mensaje: NO_VALIDA, valores };
  const resultado = await enviarAclaracion(id, valores.pregunta);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/situaciones/${id}?aviso=aclaracion`);
}
