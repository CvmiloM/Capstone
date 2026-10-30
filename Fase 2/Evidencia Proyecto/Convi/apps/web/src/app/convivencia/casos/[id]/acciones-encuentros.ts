"use server";

import { redirect } from "next/navigation";
import { enviarCambioEncuentro, enviarNuevoEncuentro } from "../datos";
import type { EstadoAccion } from "./acciones";

// PB-063 y PB-064 (HU-055): encuentros del caso. Cada formulario envía el caso
// para volver a él; los cambios sobre un encuentro envían también la versión
// que se veía, para que la API los rechace si otra persona cambió algo
// entretanto (PB-139).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDO = "El caso no es válido. Vuelve a la lista de casos.";
const RECARGAR = "Recarga la página e inténtalo nuevamente.";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

/** Las casillas marcadas llegan como "ROL:persona"; se guardan unidas para no perderlas. */
function leerAsistentes(formData: FormData) {
  const marcados = formData
    .getAll("asistentes")
    .filter((valor): valor is string => typeof valor === "string");
  return {
    texto: marcados.join(","),
    lista: marcados.map((valor) => {
      const [rol, persona_id] = valor.split(":");
      return { rol, persona_id };
    }),
  };
}

function volver(casoId: string, aviso: string): never {
  redirect(
    `/convivencia/casos/${casoId}?seccion=encuentros&aviso=${aviso}#encuentros`,
  );
}

// PB-063 (CA1 y CA4): tipo, objetivo, responsable, lugar, fecha y asistentes.
export async function programarEncuentro(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const asistentes = leerAsistentes(formData);
  const valores = {
    tipo: leerTexto(formData, "tipo"),
    objetivo: leerTexto(formData, "objetivo"),
    descripcion: leerTexto(formData, "descripcion"),
    responsable_id: leerTexto(formData, "responsable_id"),
    lugar: leerTexto(formData, "lugar"),
    programado_en: leerTexto(formData, "programado_en"),
    fin_programado_en: leerTexto(formData, "fin_programado_en"),
    accion_plan_id: leerTexto(formData, "accion_plan_id"),
  };
  const conAsistentes = { ...valores, asistentes: asistentes.texto };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores: conAsistentes };
  const resultado = await enviarNuevoEncuentro(casoId, {
    ...valores,
    asistentes: asistentes.lista,
  });
  if (!resultado.ok)
    return {
      mensaje: resultado.mensaje,
      errores: resultado.errores,
      valores: conAsistentes,
    };
  volver(casoId, "encuentro");
}

// Decisión del PO (por defecto): se suman asistentes mientras no se realice.
export async function agregarAsistentes(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const encuentroId = leerTexto(formData, "encuentro_id");
  const asistentes = leerAsistentes(formData);
  const valores = { asistentes: asistentes.texto };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(encuentroId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarCambioEncuentro(encuentroId, "asistentes", {
    asistentes: asistentes.lista,
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "encuentro-asistentes");
}

// PB-063 (CA5): la nueva fecha con su motivo; el encuentro queda Pospuesto.
export async function reprogramarEncuentro(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const encuentroId = leerTexto(formData, "encuentro_id");
  const valores = {
    programado_en: leerTexto(formData, "programado_en"),
    fin_programado_en: leerTexto(formData, "fin_programado_en"),
    motivo: leerTexto(formData, "motivo"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(encuentroId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarCambioEncuentro(encuentroId, "reprogramacion", {
    ...valores,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "encuentro-reprogramado");
}

// PB-064 (CA2 a CA4): inicio y término reales, resultado y la asistencia de
// cada participante, que llega como asistencia_<participación>.
export async function registrarEncuentro(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const encuentroId = leerTexto(formData, "encuentro_id");
  const asistencia: { participacion_id: string; estado: string }[] = [];
  const valores: Record<string, string> = {
    realizado_en: leerTexto(formData, "realizado_en"),
    fin_real_en: leerTexto(formData, "fin_real_en"),
    resultado: leerTexto(formData, "resultado"),
  };
  for (const [campo, valor] of formData.entries()) {
    if (!campo.startsWith("asistencia_") || typeof valor !== "string") continue;
    valores[campo] = valor;
    asistencia.push({
      participacion_id: campo.slice("asistencia_".length),
      estado: valor,
    });
  }
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(encuentroId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarCambioEncuentro(encuentroId, "realizacion", {
    realizado_en: valores.realizado_en,
    fin_real_en: valores.fin_real_en,
    resultado: valores.resultado,
    asistencia,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "encuentro-realizado");
}

// Decisión del PO (por defecto): cancelar exige motivo.
export async function cancelarEncuentro(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const encuentroId = leerTexto(formData, "encuentro_id");
  const valores = { motivo: leerTexto(formData, "motivo") };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  if (!UUID.test(encuentroId)) return { mensaje: RECARGAR, valores };
  const resultado = await enviarCambioEncuentro(encuentroId, "cancelacion", {
    ...valores,
    version: leerTexto(formData, "version"),
  });
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "encuentro-cancelado");
}
