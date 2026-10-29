"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enviarCambio } from "../estudiantes/datos";
import { invitarApoderado } from "../usuarios/datos";
import type { EstadoFormulario } from "../estudiantes/acciones";

export async function gestionarAccesoApoderado(estudianteId: string, vinculoId: string, _anterior: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const operacion = formulario.get("operacion");
  if (!["invitar", "otorgar", "renovar", "revocar"].includes(String(operacion))) return { mensaje: "Elige una operación válida para este vínculo" };
  const base = `/admin/apoderados/${encodeURIComponent(vinculoId)}/accesos`;
  const acceso = formulario.get("acceso_id");
  const vence = formulario.get("vence_el");
  if (["renovar", "revocar"].includes(String(operacion)) && (typeof acceso !== "string" || !/^[0-9a-f-]{36}$/i.test(acceso))) return { mensaje: "Actualiza la ficha antes de continuar" };
  const resultado = operacion === "invitar" ? await invitarApoderado(vinculoId)
    : await enviarCambio(operacion === "otorgar" ? "POST" : "PATCH",
      operacion === "otorgar" ? base : `${base}/${encodeURIComponent(String(acceso))}/${operacion === "renovar" ? "renovacion" : "revocacion"}`,
      operacion === "revocar" ? { confirmado: formulario.get("confirmar") === "si" } : { vence_el: typeof vence === "string" ? vence : "" });
  if (!resultado.ok) return { mensaje: resultado.errores?.correo ?? resultado.mensaje, errores: resultado.errores };
  revalidatePath(`/admin/estudiantes/${estudianteId}/apoderados`);
  revalidatePath("/admin/apoderados");
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/auditoria");
  redirect(`/admin/estudiantes/${encodeURIComponent(estudianteId)}/apoderados?${new URLSearchParams({ apoderado: vinculoId, acceso: String(operacion) })}#vinculo-${encodeURIComponent(vinculoId)}`);
}
