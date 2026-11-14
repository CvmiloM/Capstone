"use server";

import { redirect } from "next/navigation";
import { enviarToma } from "../datos";

export type EstadoToma = { mensaje?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO = /^[A-Z0-9-]{3,40}$/;
// Solo se vuelve a la bandeja con sus filtros, nunca a otra dirección.
const BANDEJA = /^\/convivencia\/situaciones(\?[A-Za-z0-9_=&%.+-]*)?$/;

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// Bandeja: quien consulta toma una situación abierta sin responsable. La API
// aplica las reglas de PB-046 (primera asignación, queda en el historial) y la
// rechaza si otra persona la tomó antes. Se vuelve a la misma página de la
// bandeja, con sus filtros, y un aviso con el código.
export async function tomarSituacion(
  _anterior: EstadoToma,
  formData: FormData,
): Promise<EstadoToma> {
  const id = leerTexto(formData, "situacion_id");
  if (!UUID.test(id)) {
    return { mensaje: "La situación no es válida. Recarga la bandeja." };
  }
  const resultado = await enviarToma(id);
  if (!resultado.ok) return { mensaje: resultado.mensaje };

  const volver = leerTexto(formData, "volver");
  const destino = new URL(
    BANDEJA.test(volver) ? volver : "/convivencia/situaciones",
    "http://bandeja",
  );
  const codigo = leerTexto(formData, "codigo");
  if (CODIGO.test(codigo)) destino.searchParams.set("tomada", codigo);
  redirect(`${destino.pathname}${destino.search}`);
}
