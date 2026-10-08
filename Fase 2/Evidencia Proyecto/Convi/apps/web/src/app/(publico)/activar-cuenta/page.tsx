import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { FormularioActivacion } from "./formulario-activacion";

export const metadata: Metadata = { title: "Activar cuenta" };

// El correo de invitación (lo envía el backend con Supabase Auth) trae el token
// de Supabase y la membresía PENDIENTE que se activa con convi.activar_invitacion:
// /activar-cuenta?token_hash={{ .TokenHash }}&type=invite&membresia={{ .Data.membresia_id }}
export default function PaginaActivarCuenta({
  searchParams,
}: PageProps<"/activar-cuenta">) {
  // Con cacheComponents, leer searchParams tiene que ir dentro de <Suspense>.
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Revisando el enlace…</p>}
    >
      <ContenidoActivacion searchParams={searchParams} />
    </Suspense>
  );
}

async function ContenidoActivacion({
  searchParams,
}: Pick<PageProps<"/activar-cuenta">, "searchParams">) {
  const { token_hash, membresia } = await searchParams;

  if (
    typeof token_hash !== "string" ||
    !token_hash ||
    typeof membresia !== "string" ||
    !membresia
  ) {
    return (
      <>
        <Encabezado
          titulo="Este enlace no es válido"
          descripcion="Puede que esté incompleto, que haya vencido o que ya se haya usado. Pide al administrador de tu establecimiento que te reenvíe la invitación."
        />
        <p className="text-sm text-muted-foreground">
          ¿Ya activaste tu cuenta?{" "}
          <Link href="/login" className={claseEnlace}>
            Inicia sesión
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <Encabezado
        titulo="Activa tu cuenta"
        descripcion="Define la contraseña con la que vas a entrar a CONVI. Tu establecimiento y tu perfil ya los asignó el administrador."
      />
      <FormularioActivacion tokenHash={token_hash} membresia={membresia} />
    </>
  );
}
