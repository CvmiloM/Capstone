import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { FormularioRegistro } from "./formulario-registro";

export const metadata: Metadata = { title: "Registrar establecimiento" };

export default function PaginaRegistro() {
  return (
    <>
      <Encabezado
        titulo="Registra tu establecimiento"
        descripcion="Primero crea tu cuenta de administrador. Cuando verifiques tu correo podrás ingresar los datos de tu establecimiento."
      />
      <FormularioRegistro />

      <div className="mt-8 space-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <p>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className={claseEnlace}>
            Inicia sesión
          </Link>
        </p>
        <p>
          Si tu establecimiento ya usa CONVI, no te registres aquí: pide al
          administrador que te envíe una invitación.
        </p>
      </div>
    </>
  );
}
