import type { Metadata } from "next";
import Link from "next/link";
import {
  claseBotonPrimario,
  claseEnlace,
  Encabezado,
} from "@/app/components/formulario";

export const metadata: Metadata = { title: "Enlace no válido" };

export default function PaginaEnlaceInvalido() {
  return (
    <>
      <Encabezado
        titulo="El enlace no es válido"
        descripcion="Puede que haya vencido (dura una hora) o que ya lo hayas usado."
      />
      <p className="text-sm text-muted-foreground">
        Si todavía no verificas tu correo, vuelve a registrarte con el mismo
        correo y te enviaremos un enlace nuevo. Si ya lo verificaste,{" "}
        <Link href="/login" className={claseEnlace}>
          inicia sesión
        </Link>
        .
      </p>
      <Link href="/registro" className={`${claseBotonPrimario} mt-6 w-full`}>
        Volver al registro
      </Link>
    </>
  );
}