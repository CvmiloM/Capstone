"use server";

import { redirect } from "next/navigation";
import { enviarEvidencia } from "./datos";
import type { DestinoEvidencia, EstadoEvidencia } from "./opciones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ruta de la API y página a la que se vuelve según dónde se adjunta. El
// destino solo elige la ruta: la API comprueba el perfil y el permiso.
const DESTINOS: Record<
  DestinoEvidencia,
  (id: string) => { api: string; volver: string }
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
  "convivencia-paso": (id) => ({
    api: `/convivencia/casos/${id}/evidencias`,
    volver: `/convivencia/casos/${id}?seccion=protocolo&aviso=paso-evidencia`,
  }),
  "profesor-situacion": (id) => ({
    api: `/profesor/situaciones/${id}/evidencias`,
    volver: `/profesor/situaciones/${id}?evidencia=1`,
  }),
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
  };
  const nombreDestino = leerTexto(formData, "destino");
  const pasoId = leerTexto(formData, "paso_caso_id");
  if (
    !UUID.test(id) ||
    !Object.hasOwn(DESTINOS, nombreDestino) ||
    (nombreDestino === "convivencia-paso" && !UUID.test(pasoId))
  )
    return {
      mensaje: "No se puede adjuntar aquí. Recarga la página.",
      valores,
    };
  const destino = DESTINOS[nombreDestino as DestinoEvidencia](id);

  const cuerpo = new FormData();
  for (const [campo, valor] of Object.entries(valores))
    cuerpo.set(campo, valor);
  if (nombreDestino === "convivencia-paso") cuerpo.set("paso_caso_id", pasoId);
  const archivo = formData.get("archivo");
  if (archivo instanceof File && archivo.size > 0)
    cuerpo.set("archivo", archivo, archivo.name);

  const resultado = await enviarEvidencia(destino.api, cuerpo);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(
    nombreDestino === "convivencia-paso"
      ? `${destino.volver}#paso-${pasoId}`
      : destino.volver,
  );
}
