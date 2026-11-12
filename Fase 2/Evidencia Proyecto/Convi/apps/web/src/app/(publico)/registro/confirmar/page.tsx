import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Encabezado, claseBotonPrimario } from "@/app/components/formulario";
import { FormularioConCarga } from "@/app/components/actividad";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { confirmarCorreoConConsentimiento, hashConfirmacionValido } from "@/lib/supabase/confirmacion";

export const metadata: Metadata = {
  title: "Confirmar correo", referrer: "no-referrer", robots: { index: false, follow: false },
};

type Propiedades = {
  searchParams: Promise<{ token_hash?: string; aviso?: string }>
};

export default function PaginaConfirmar(propiedades: Propiedades) {
  return <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Comprobando el enlace…</p>}>
    <ConfirmacionDeLaCuenta {...propiedades} />
  </Suspense>;
}

async function ConfirmacionDeLaCuenta({ searchParams }: Propiedades) {
  const parametros = await searchParams;
  const token = parametros.token_hash;
  if (!hashConfirmacionValido(token)) redirect("/registro/enlace-invalido");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  const identidad = data.user?.id ?? null;
  async function confirmar(formulario: FormData) {
    "use server";
    const cliente = await crearClienteServidor();
    const resultado = await confirmarCorreoConConsentimiento(cliente.auth, token!, formulario.get("aceptar") === "si", identidad);
    if (resultado.ok) redirect("/registro/escuela");
    if (resultado.motivo === "enlace") redirect("/registro/enlace-invalido");
    redirect(`/registro/confirmar?${new URLSearchParams({ token_hash: token!, aviso: resultado.motivo })}`);
  }
  return <>
    <Encabezado titulo="Confirma tu correo" descripcion="Al continuar se iniciará la sesión de la cuenta a la que pertenece este enlace." />
    {data.user?.email && <p className="mb-4 rounded-xl border border-border p-4 text-sm">
      Tu sesión actual es {data.user.email}. Si el enlace pertenece a otra cuenta, la sesión cambiará.
    </p>}
    {parametros.aviso && <p role="alert" className="mb-4 text-sm text-destructive">
      {parametros.aviso === "sesion" ? "La sesión cambió mientras veías la página. Revisa la cuenta actual y confirma de nuevo."
        : parametros.aviso === "conexion" ? "No pudimos comprobar tu sesión. Inténtalo nuevamente."
        : "Confirma que quieres iniciar la sesión de la cuenta del enlace."}
    </p>}
    <FormularioConCarga action={confirmar} className="space-y-5">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="aceptar" value="si" required className="mt-1 accent-primary" />
        Quiero confirmar este correo e iniciar la sesión de la cuenta del enlace.
      </label>
      <button type="submit" className={claseBotonPrimario}>Confirmar e iniciar sesión</button>
    </FormularioConCarga>
  </>;
}
