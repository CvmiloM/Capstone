"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// Refinamientos de Convivencia, sección 5: crear y desactivar el enlace
// privado del calendario para Google Calendar. La API exige la cuenta de
// Convivencia con segundo factor y solo toca el enlace de esa cuenta.

const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

export type EstadoEnlace = {
  /** Código recién creado: se muestra una sola vez. */
  codigo?: string;
  desactivado?: boolean;
  mensaje?: string;
};

async function llamar(ruta: string) {
  const cliente = await crearClienteServidor();
  const { data } = await cliente.auth.getSession();
  if (!data.session) redirect("/login");
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}/convivencia/calendario/suscripcion${ruta}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (respuesta.status === 401) redirect("/login");
  if (!respuesta.ok) return null;
  return (await respuesta.json().catch(() => null)) as Record<string, unknown> | null;
}

export async function crearEnlaceCalendario(): Promise<EstadoEnlace> {
  const datos = await llamar("");
  if (typeof datos?.codigo !== "string")
    return { mensaje: "No pudimos crear el enlace, inténtalo nuevamente" };
  revalidatePath("/convivencia/calendario");
  return { codigo: datos.codigo };
}

export async function desactivarEnlaceCalendario(): Promise<EstadoEnlace> {
  const datos = await llamar("/revocar");
  if (typeof datos?.revocada !== "boolean")
    return { mensaje: "No pudimos desactivar el enlace, inténtalo nuevamente" };
  revalidatePath("/convivencia/calendario");
  return { desactivado: true };
}
