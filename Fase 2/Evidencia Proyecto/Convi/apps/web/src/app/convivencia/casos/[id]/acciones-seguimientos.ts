"use server";

import { redirect } from "next/navigation";
import { enviar } from "../../datos";
import type { EstadoAccion } from "./acciones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function guardarSeguimiento(
  _anterior: EstadoAccion,
  formulario: FormData,
): Promise<EstadoAccion> {
  const valores: Record<string, string> = {};
  for (const [nombre, valor] of formulario)
    if (typeof valor === "string" && !nombre.startsWith("$ACTION"))
      valores[nombre] = valor.trim();
  const { caso_id, seguimiento_id, modo } = valores;
  if (!UUID.test(caso_id ?? ""))
    return { mensaje: "Vuelve a abrir el caso antes de continuar", valores };
  let ruta: string, cuerpo: unknown;
  if (modo === "compromiso") {
    ruta = `/convivencia/casos/${caso_id}/compromisos`;
    cuerpo = {
      descripcion: valores.descripcion,
      persona_responsable_id: valores.persona_responsable_id,
      vence_en: valores.vence_en,
      actuacion_origen_id: valores.actuacion_origen_id,
    };
  } else if (modo === "programar") {
    ruta = `/convivencia/casos/${caso_id}/seguimientos`;
    cuerpo = {
      objetivo: valores.objetivo,
      responsable_id: valores.responsable_id,
      programado_en: valores.programado_en,
    };
  } else {
    if (
      !UUID.test(seguimiento_id ?? "") ||
      !["resultado", "reprogramacion", "revisiones"].includes(modo)
    )
      return { mensaje: "Recarga la página antes de continuar", valores };
    ruta = `/convivencia/seguimientos/${seguimiento_id}/${modo}`;
    if (modo === "reprogramacion")
      cuerpo = {
        programado_en: valores.programado_en,
        motivo: valores.motivo,
        version: valores.version,
      };
    else if (modo === "revisiones")
      cuerpo = {
        compromiso_id: valores.compromiso_id,
        estado_observado: valores.estado_observado,
        observacion: valores.observacion,
        version: valores.version_compromiso,
      };
    else
      cuerpo = {
        realizado_en: valores.realizado_en,
        resultado: valores.resultado,
        proxima_accion: valores.proxima_accion,
        version: valores.version,
        revisiones: Object.keys(valores)
          .filter((k) => k.startsWith("estado_") && valores[k])
          .map((k) => {
            const id = k.slice(7);
            return {
              compromiso_id: id,
              estado_observado: valores[k],
              observacion: valores[`observacion_${id}`],
              version: valores[`version_${id}`],
            };
          }),
        siguiente:
          valores.otro === "on"
            ? {
                objetivo: valores.objetivo,
                responsable_id: valores.responsable_id,
                programado_en: valores.programado_en,
              }
            : null,
      };
  }
  const respuesta = await enviar("POST", ruta, cuerpo);
  if (!respuesta.ok)
    return { mensaje: respuesta.mensaje, errores: respuesta.errores, valores };
  redirect(
    `/convivencia/casos/${caso_id}?seccion=${modo === "compromiso" ? "compromisos" : "seguimientos"}&aviso=${modo === "compromiso" ? "compromiso" : "seguimiento"}#seguimientos`,
  );
}
