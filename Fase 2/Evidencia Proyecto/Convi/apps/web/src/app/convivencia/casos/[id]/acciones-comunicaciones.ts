"use server";

import { redirect } from "next/navigation";
import { enviarEvidencia } from "@/app/components/evidencias/datos";
import type { EstadoAccion } from "./acciones";
import { DESTINATARIO_EXTERNO } from "./opciones";

// PB-067 (HU-058): registra la comunicación con su respaldo opcional, en un
// formulario multipart como las evidencias. La API vuelve a validar todo.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDO = "El caso no es válido. Vuelve a la lista de casos.";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// CA1 y CA2: tipo, destinatario del caso o externo, resumen, fecha en que
// ocurrió y respaldo opcional.
export async function registrarComunicacion(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const valores = {
    tipo: leerTexto(formData, "tipo"),
    persona_destinataria_id: leerTexto(formData, "persona_destinataria_id"),
    destinatario_externo: leerTexto(formData, "destinatario_externo"),
    resumen: leerTexto(formData, "resumen"),
    ocurrido_en: leerTexto(formData, "ocurrido_en"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };

  const externo = valores.persona_destinataria_id === DESTINATARIO_EXTERNO;
  const cuerpo = new FormData();
  cuerpo.set("tipo", valores.tipo);
  if (externo) cuerpo.set("destinatario_externo", valores.destinatario_externo);
  else if (valores.persona_destinataria_id)
    cuerpo.set("persona_destinataria_id", valores.persona_destinataria_id);
  cuerpo.set("resumen", valores.resumen);
  cuerpo.set("ocurrido_en", valores.ocurrido_en);
  const archivo = formData.get("archivo");
  if (archivo instanceof File && archivo.size > 0)
    cuerpo.set("archivo", archivo, archivo.name);

  const resultado = await enviarEvidencia(
    `/convivencia/casos/${casoId}/comunicaciones`,
    cuerpo,
    "No pudimos registrar la comunicación. Revisa tu conexión e inténtalo nuevamente.",
  );
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  redirect(
    `/convivencia/casos/${casoId}?seccion=comunicaciones&aviso=comunicacion#comunicaciones`,
  );
}
