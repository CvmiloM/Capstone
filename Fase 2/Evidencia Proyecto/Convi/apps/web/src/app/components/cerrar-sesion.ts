"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export async function cerrarSesion(): Promise<string | null> {
  try {
    const supabase = await crearClienteServidor();
    // Sale de este navegador; las sesiones de otros dispositivos se conservan.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return "No pudimos cerrar tu sesión. Inténtalo nuevamente.";
  } catch {
    return "No pudimos cerrar tu sesión. Inténtalo nuevamente.";
  }

  // La salida de Supabase elimina las cookies; redirigir queda fuera del manejo de errores.
  redirect("/login");
}
