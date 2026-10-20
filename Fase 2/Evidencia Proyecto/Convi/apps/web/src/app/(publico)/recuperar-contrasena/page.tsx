import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { FormularioRecuperacion } from "./formulario-recuperacion";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PaginaRecuperacion() {
  return (
    <>
      <Encabezado
        titulo="Recupera tu contraseña"
        descripcion="Escribe el correo de tu cuenta para solicitar un enlace de recuperación."
      />
      <FormularioRecuperacion />
      <Link
        href="/login"
        className={`${claseEnlace} mt-6 inline-block text-sm`}
      >
        Volver a iniciar sesión
      </Link>
    </>
  );
}
