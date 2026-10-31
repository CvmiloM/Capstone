"use server";

import { redirect } from "next/navigation";
import { enviarEvidencia } from "./datos";
import type { DestinoEvidencia, EstadoEvidencia } from "./opciones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ruta de la API y página a la que se vuelve según dónde se adjunta. El
// destino solo elige la ruta: la API comprueba el perfil y el permiso. Para
// un paso o un encuentro, el registro es el caso y detalle es su id.
const DESTINOS: Record<
  DestinoEvidencia,
  (id: string, detalle: string) => { api: string; volver: string }
> = {
  "convivencia-situacion": (id) => ({
    api: `/convivencia/situaciones/${id}/evidencias`,
    volver: `/convivencia/situaciones/${id}?seccion=evidencias&aviso=evidencia`,
  }),
  "convivencia-caso": (id) => ({
    api: `/convivencia/casos/${id}/evidencias`,
    volver: `/convivencia/casos/${id}?seccion=evidencias&aviso=evidencia`,
  }),
  // PB-055 (HU-048 CA3): misma ruta del caso, con el paso al que respalda.
  "convivencia-paso": (id, paso) => ({
    api: `/convivencia/casos/${id}/evidencias`,
    volver: `/convivencia/casos/${id}?seccion=protocolo&aviso=paso-evidencia#paso-${paso}`,
  }),
  // PB-072 (HU-062): acta firmada de una entrevista o reunión del caso.
  "convivencia-acta": (id, encuentro) => ({
    api: `/convivencia/encuentros/${encuentro}/actas`,
    volver: `/convivencia/casos/${id}?seccion=encuentros&aviso=acta#encuentro-${encuentro}`,
  }),
  "profesor-situacion": (id) => ({
    api: `/profesor/situaciones/${id}/evidencias`,
    volver: `/profesor/situaciones/${id}?evidencia=1`,
  }),
};

/** Campo del formulario con el paso o el encuentro, si el destino lo usa. */
const CAMPO_DETALLE: Partial<Record<DestinoEvidencia, string>> = {
  "convivencia-paso": "paso_caso_id",
  "convivencia-acta": "encuentro_id",
};

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-066 (HU-057): adjunta la evidencia. La API revisa el archivo (PB-130),
// lo guarda en el espacio privado y responde con los errores por campo.
export async function adjuntarEvidencia(
  _anterior: EstadoEvidencia,
  formData: FormData,
): Promise<EstadoEvidencia> {
  const id = leerTexto(formData, "registro_id");
  const valores = {
    titulo: leerTexto(formData, "titulo"),
    tipo: leerTexto(formData, "tipo"),
    descripcion: leerTexto(formData, "descripcion"),
    // PB-072: solo el acta lleva la fecha del documento.
    fecha_documento: leerTexto(formData, "fecha_documento"),
  };
  const nombreDestino = leerTexto(formData, "destino");
  const campoDetalle = Object.hasOwn(CAMPO_DETALLE, nombreDestino)
    ? CAMPO_DETALLE[nombreDestino as DestinoEvidencia]
    : undefined;
  const detalle = campoDetalle ? leerTexto(formData, campoDetalle) : "";
  if (
    !UUID.test(id) ||
    !Object.hasOwn(DESTINOS, nombreDestino) ||
    (campoDetalle && !UUID.test(detalle))
  )
    return {
      mensaje: "No se puede adjuntar aquí. Recarga la página.",
      valores,
    };
  const destino = DESTINOS[nombreDestino as DestinoEvidencia](id, detalle);

  const cuerpo = new FormData();
  for (const [campo, valor] of Object.entries(valores))
    if (valor) cuerpo.set(campo, valor);
  if (nombreDestino === "convivencia-paso") cuerpo.set("paso_caso_id", detalle);
  const archivo = formData.get("archivo");
  if (archivo instanceof File && archivo.size > 0)
    cuerpo.set("archivo", archivo, archivo.name);

  const resultado = await enviarEvidencia(destino.api, cuerpo);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(destino.volver);
}
