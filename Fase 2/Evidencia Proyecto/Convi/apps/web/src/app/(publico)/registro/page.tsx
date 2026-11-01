import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { FormularioRegistro } from "./formulario-registro";

export const metadata: Metadata = { title: "Crear cuenta de administrador" };

export default function PaginaRegistro() {
  return (
    <>
      <Encabezado
        titulo="Crea tu cuenta de administrador"
        descripcion="Cuando verifiques tu correo, continuaremos con los datos de tu establecimiento"
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
          administrador que te envíe una invitación
        </p>
        <p>Cada correo puede pertenecer a un establecimiento a la vez</p>
      </div>
    </>
  );
}
