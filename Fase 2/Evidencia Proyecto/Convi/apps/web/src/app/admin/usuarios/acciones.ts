"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  enviarInvitacion,
  reenviarInvitacion,
  suspenderCuenta,
  reactivarCuenta,
  restablecerSegundoFactor,
} from "./datos";
import { NOMBRE_PERFIL } from "./opciones";

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
  // PB-033: el mismo formulario se usa en el paso Equipo de la guía.
  revalidatePath("/admin/guia");
  return { invitado: resultado.correo };
}

export type EstadoReenvio = { mensaje?: string; reenviado?: boolean };

export async function reenviarCuenta(
  id: string,
  solicitudId: string,
): Promise<EstadoReenvio> {
  const resultado = await reenviarInvitacion(id, solicitudId);
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidatePath("/admin/usuarios");
  return { reenviado: true };
}

export type EstadoSuspension = { mensaje?: string };

export async function suspenderUsuario(
  id: string,
  _anterior: EstadoSuspension,
  formData: FormData,
): Promise<EstadoSuspension> {
  const resultado = await suspenderCuenta(id);
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidatePath("/admin/usuarios");
  // La cuenta suspendida deja de mostrar el formulario: confirmar en una página nueva.
  redirect(destinoUsuarios(formData, "suspension"));
}

export async function reactivarUsuario(
  id: string,
  _anterior: EstadoSuspension,
  formData: FormData,
): Promise<EstadoSuspension> {
  const resultado = await reactivarCuenta(id, leerTexto(formData, "motivo"));
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidatePath("/admin/usuarios");
  redirect(destinoUsuarios(formData, "reactivacion"));
}

function destinoUsuarios(
  formData: FormData,
  resultado: "suspension" | "reactivacion" | "autenticador",
) {
  const consulta = new URLSearchParams({ [resultado]: "realizada" });
  const perfil = leerTexto(formData, "perfil");
  if (Object.hasOwn(NOMBRE_PERFIL, perfil)) consulta.set("perfil", perfil);
  if (formData.get("suspendidas") === "1") consulta.set("suspendidas", "1");
  return `/admin/usuarios?${consulta}`;
}

export async function restablecerAutenticador(
  id: string,
  solicitudId: string,
  _anterior: EstadoSuspension,
  formData: FormData,
): Promise<EstadoSuspension> {
  const resultado = await restablecerSegundoFactor(id, {
    solicitud_id: solicitudId,
    identidad_verificada: formData.get("identidad_verificada") === "si",
    medio: leerTexto(formData, "medio"),
    motivo: leerTexto(formData, "motivo"),
  });
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  revalidatePath("/admin/usuarios");
  redirect(destinoUsuarios(formData, "autenticador"));
}
