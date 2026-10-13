import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Encabezado } from "@/app/components/formulario";
import { consultarVerificacion } from "./acciones";
import { FormularioVerificacion } from "./formulario-verificacion";

export const metadata: Metadata = { title: "Verificar segundo factor" };

async function VerificacionDeLaCuenta() {
  // Auth consulta el vencimiento de la sesión solo al llegar una petición real.
  await connection();
  const estado = await consultarVerificacion();
  if (estado.paso === "sin-sesion") redirect("/login");
  return <FormularioVerificacion inicial={estado} />;
}

export default function PaginaVerificacion() {
  return (
    <>
      <Encabezado
        titulo="Verificar segundo factor"
        descripcion="Confirma tu identidad con el código de tu aplicación autenticadora."
      />
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Comprobando tu cuenta…
          </p>
        }
      >
        <VerificacionDeLaCuenta />
      </Suspense>
    </>
  );
}
