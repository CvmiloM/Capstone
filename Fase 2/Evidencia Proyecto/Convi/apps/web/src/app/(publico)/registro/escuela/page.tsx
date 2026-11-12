import type { Metadata } from "next";
import { Suspense } from "react";
import { Encabezado } from "@/app/components/formulario";
import { FormularioEscuela } from "./formulario-escuela";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Registrar establecimiento" };

// Destino del enlace de confirmación (PB-001); la sesión ya quedó iniciada.
// Al crear la escuela, la persona queda como su administrador y pasa a
// configurar el segundo factor (PB-008).
async function RegistroConIdentidad() {
  const cliente = await crearClienteServidor();
  const { data } = await cliente.auth.getUser();
  return <>
    {data.user?.email && <p className="mb-5 text-sm text-muted-foreground">Estás continuando con {data.user.email}.</p>}
    <FormularioEscuela />
  </>;
}

export default function PaginaRegistroEscuela() {
  return (
    <>
      <Encabezado
        titulo="Registra tu establecimiento"
        descripcion="Tu correo quedó verificado. Completa los datos de tu establecimiento: quedarás como su administrador."
      />
      <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Comprobando tu cuenta…</p>}>
        <RegistroConIdentidad />
      </Suspense>
    </>
  );
}
