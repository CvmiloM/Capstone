"use server";

import { revalidatePath } from "next/cache";
import { enviarInvitacion, reenviarInvitacion } from "./datos";

export type EstadoInvitacion = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** Valores enviados, para no vaciar el formulario si hay errores. */
  valores?: Record<string, string>;
  /** Correo al que se envió, para confirmarlo sobre el formulario vacío. */
  invitado?: string;
};

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-010 (HU-009): la API crea la ficha y la cuenta Pendiente y envía el
// correo con el enlace de activación. Quién invita y la escuela salen de la
// sesión, nunca del formulario.
export async function invitarCuenta(
  _anterior: EstadoInvitacion,
  formData: FormData,
): Promise<EstadoInvitacion> {
  const valores = {
    nombres: leerTexto(formData, "nombres"),
    apellidos: leerTexto(formData, "apellidos"),
    correo: leerTexto(formData, "correo"),
    perfil: leerTexto(formData, "perfil"),
  };
  const resultado = await enviarInvitacion(valores);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin/usuarios");
  return { invitado: resultado.correo };
}

export type EstadoReenvio = { mensaje?: string; reenviado?: boolean };

export async function reenviarCuenta(id: string): Promise<EstadoReenvio> {
  const resultado = await reenviarInvitacion(id);
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidatePath("/admin/usuarios");
  return { reenviado: true };
}
