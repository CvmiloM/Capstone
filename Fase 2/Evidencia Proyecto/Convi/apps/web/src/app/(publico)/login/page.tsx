import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function PaginaLogin() {
  return (
    <>
      <Encabezado
        titulo="Inicia sesión"
        descripcion="Ingresa con el correo y la contraseña de tu cuenta CONVI."
      />
      <FormularioLogin />

      <div className="mt-8 space-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <p>
          ¿Tu establecimiento aún no usa CONVI?{" "}
          <Link href="/registro" className={claseEnlace}>
            Regístralo aquí
          </Link>
        </p>
        <p>
          ¿Te invitaron a CONVI? Abre el enlace del correo de invitación para
          activar tu cuenta.
        </p>
      </div>
    </>
  );
}
