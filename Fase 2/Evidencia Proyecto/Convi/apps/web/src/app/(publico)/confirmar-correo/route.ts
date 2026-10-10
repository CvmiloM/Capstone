import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// Enlace del correo de confirmación (supabase/templates/confirmacion.html):
// /confirmar-correo?token_hash=...&type=email. Si es válido, Supabase marca el
// correo como verificado y deja la sesión iniciada en cookies (HU-001).
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const tipo = request.nextUrl.searchParams.get("type");

  if (tokenHash && tipo === "email") {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    if (!error) redirect("/registro/escuela");
  }

  // Vencido, ya usado o alterado: el mismo aviso para todos los casos.
  redirect("/registro/enlace-invalido");
}