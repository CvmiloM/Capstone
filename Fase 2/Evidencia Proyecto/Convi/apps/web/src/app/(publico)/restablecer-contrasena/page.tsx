import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { consultarRestablecimiento } from "../recuperar-contrasena/acciones";
import { FormularioRestablecimiento } from "./formulario-restablecimiento";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PaginaRestablecimiento({
  searchParams,
}: PageProps<"/restablecer-contrasena">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">
          Comprobando recuperación…
        </p>
      }
    >
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({
  searchParams,
}: Pick<PageProps<"/restablecer-contrasena">, "searchParams">) {
  const parametros = await searchParams;
  const token = parametros.token_hash;
  if (token !== undefined || parametros.type !== undefined) {
    if (
      typeof token !== "string" ||
      !token ||
      token.length > 512 ||
      parametros.type !== "recovery"
    )
      return <EnlaceInvalido />;
    return (
      <>
        <Encabezado
          titulo="Continúa la recuperación"
          descripcion="Confirma que quieres definir una nueva contraseña. El enlace solo se comprueba cuando pulsas Continuar."
        />
        <FormularioRestablecimiento tokenHash={token} />
      </>
    );
  }
  const estado = await consultarRestablecimiento();
  if (estado.paso === "invalido")
    return <EnlaceInvalido mensaje={estado.mensaje} />;
  return (
    <>
      <Encabezado
        titulo="Define tu nueva contraseña"
        descripcion="La contraseña cambiará solo para la cuenta del enlace que confirmaste."
      />
      <FormularioRestablecimiento requiereCodigo={estado.paso === "codigo"} />
    </>
  );
}

function EnlaceInvalido({
  mensaje = "Abre el enlace de recuperación más reciente. Puede que el anterior haya vencido o ya se haya usado.",
}: {
  mensaje?: string;
}) {
  return (
    <>
      <Encabezado titulo="No pudimos continuar" descripcion={mensaje} />
      <Link href="/recuperar-contrasena" className={claseEnlace}>
        Solicitar otro enlace
      </Link>
    </>
  );
}
