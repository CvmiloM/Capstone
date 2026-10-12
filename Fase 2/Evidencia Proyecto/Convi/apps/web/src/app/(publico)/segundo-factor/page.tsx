import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Encabezado } from "@/app/components/formulario";
import { FormularioSegundoFactor } from "./formulario-segundo-factor";
import { consultarSegundoFactor } from "./acciones";

export const metadata: Metadata = { title: "Configurar segundo factor" };

async function ConfiguracionDeLaCuenta() {
  // Auth consulta la hora de vencimiento: cargarlo solo al llegar una petición.
  await connection();
  const estado = await consultarSegundoFactor();
  if (estado.paso === "sin-sesion") redirect("/login");
  return <FormularioSegundoFactor inicial={estado} />;
}

export default function PaginaSegundoFactor() {
  return (
    <>
      <Encabezado
        titulo="Configurar segundo factor"
        descripcion="Protege tu cuenta con un código de tu aplicación autenticadora."
      />
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Comprobando tu cuenta…
          </p>
        }
      >
        <ConfiguracionDeLaCuenta />
      </Suspense>
    </>
  );
}
