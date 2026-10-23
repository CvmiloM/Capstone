"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enviarCambio } from "../estudiantes/datos";

export type EstadoFicha = {
  mensaje?: string;
  errores?: Record<string, string>;
  valores?: Record<string, string>;
};

export async function guardarFichaInstitucional(
  _anterior: EstadoFicha,
  formData: FormData,
): Promise<EstadoFicha> {
  const valores: Record<string, string> = {};
  for (const campo of [
    "codigo",
    "direccion",
    "telefono",
    "correo_contacto",
    "region",
    "comuna",
    "actualizado_en",
  ]) {
    const valor = formData.get(campo);
    valores[campo] = typeof valor === "string" ? valor.trim() : "";
  }
  // La API comprueba ADMIN, MFA y escuela antes de ejecutar el cambio.
  const resultado = await enviarCambio(
    "PATCH",
    "/admin/establecimiento",
    valores,
  );
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  // Código y comuna también se muestran en la tarjeta lateral del portal.
  revalidatePath("/admin", "layout");
  redirect("/admin/establecimiento?ficha=guardada");
}
