"use server";

import { redirect } from "next/navigation";
import type { EstadoAccion } from "../casos/[id]/acciones";
import { enviarRevisionAlerta } from "./datos";

// PB-093 (HU-080 CA2): marca la alerta Revisada o Archivada con lo que se
// hizo. Envía la huella que se veía para que la API rechace el cambio si otra
// persona la revisó entretanto (PB-139).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

export async function revisarAlerta(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const alertaId = leerTexto(formData, "alerta_id");
  const valores = {
    estado_nuevo: leerTexto(formData, "estado_nuevo"),
    observacion: leerTexto(formData, "observacion"),
  };
  if (!UUID.test(alertaId))
    return { mensaje: "La alerta no es válida. Vuelve a la bandeja.", valores };
  const resultado = await enviarRevisionAlerta(alertaId, {
    ...valores,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  redirect(`/convivencia/alertas/${alertaId}?aviso=revisada`);
}
