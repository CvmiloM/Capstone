"use server";

import { redirect } from "next/navigation";
import {
  enviarAvanceAccionPlan,
  enviarCorreccionAccionPlan,
  enviarEstadoPlan,
  enviarNuevaAccionPlan,
  enviarNuevoPlan,
} from "../datos";
import type { EstadoAccion } from "./acciones";

// PB-061 y PB-062 (HU-054): plan de intervención del caso y sus acciones. Cada
// formulario envía el caso para volver a él; los cambios sobre el plan o una
// acción envían también la versión que se veía, para que la API los rechace
// si otra persona cambió algo entretanto (PB-139).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDO = "El caso no es válido. Vuelve a la lista de casos.";
const RECARGAR = "Recarga la página e inténtalo nuevamente.";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function volver(casoId: string, aviso: string): never {
  redirect(
    `/convivencia/casos/${casoId}?seccion=plan&aviso=${aviso}#plan-intervencion`,
  );
}

// CA1: objetivo, estado inicial y protocolo aplicado opcional.
export async function crearPlan(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const valores = {
    objetivo: leerTexto(formData, "objetivo"),
    estado: leerTexto(formData, "estado"),
    protocolo_caso_id: leerTexto(formData, "protocolo_caso_id"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  const resultado = await enviarNuevoPlan(casoId, valores);
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "plan");
}

// CA5: activar un borrador, o completar o cancelar el plan con un motivo.
export async function cambiarEstadoPlan(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const planId = leerTexto(formData, "plan_id");
  const valores = {
    estado_nuevo: leerTexto(formData, "estado_nuevo"),
    motivo: leerTexto(formData, "motivo"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(planId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarEstadoPlan(planId, {
    ...valores,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "plan-estado");
}

// CA2: descripción, persona responsable y fecha de vencimiento.
export async function agregarAccionPlan(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const planId = leerTexto(formData, "plan_id");
  const valores = {
    descripcion: leerTexto(formData, "descripcion"),
    persona_responsable_id: leerTexto(formData, "persona_responsable_id"),
    vence_dia: leerTexto(formData, "vence_dia"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(planId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarNuevaAccionPlan(planId, valores);
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "accion");
}

// CA3: En progreso, Completada con notas y el día en que se cumplió, o
// Cancelada con un motivo.
export async function avanzarAccionPlan(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const accionId = leerTexto(formData, "accion_id");
  const valores = {
    estado_nuevo: leerTexto(formData, "estado_nuevo"),
    notas: leerTexto(formData, "notas"),
    completado_dia: leerTexto(formData, "completado_dia"),
    motivo: leerTexto(formData, "motivo"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(accionId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarAvanceAccionPlan(accionId, {
    ...valores,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "accion-estado");
}

// CA4: corregir una acción exige motivo; la auditoría guarda el antes y el después.
export async function corregirAccionPlan(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const accionId = leerTexto(formData, "accion_id");
  const valores = {
    descripcion: leerTexto(formData, "descripcion"),
    persona_responsable_id: leerTexto(formData, "persona_responsable_id"),
    vence_dia: leerTexto(formData, "vence_dia"),
    notas: leerTexto(formData, "notas"),
    completado_dia: leerTexto(formData, "completado_dia"),
    motivo: leerTexto(formData, "motivo"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(accionId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarCorreccionAccionPlan(accionId, {
    ...valores,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "accion-corregida");
}
