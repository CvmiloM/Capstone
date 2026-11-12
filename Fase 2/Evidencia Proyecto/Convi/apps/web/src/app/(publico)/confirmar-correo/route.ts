import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { hashConfirmacionValido } from "@/lib/supabase/confirmacion";

// Enlace del correo de confirmación (supabase/templates/confirmacion.html):
// Mantiene enlaces existentes; un GET ya no cambia la identidad del navegador.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const tipo = request.nextUrl.searchParams.get("type");

  if (hashConfirmacionValido(tokenHash) && tipo === "email")
    redirect(`/registro/confirmar?${new URLSearchParams({ token_hash: tokenHash })}`);

  // Vencido, ya usado o alterado: el mismo aviso para todos los casos.
  redirect("/registro/enlace-invalido");
}
