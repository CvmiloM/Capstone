import type { Metadata } from "next";
import { Encabezado } from "@/app/components/formulario";
import { FormularioEscuela } from "./formulario-escuela";

export const metadata: Metadata = { title: "Registrar establecimiento" };

// Destino del enlace de confirmación (PB-001); la sesión ya quedó iniciada.
// Al crear la escuela, la persona queda como su administrador y pasa a
// configurar el segundo factor (PB-008).
export default function PaginaRegistroEscuela() {
  return (
    <>
      <Encabezado
        titulo="Registra tu establecimiento"
        descripcion="Tu correo quedó verificado. Completa los datos de tu establecimiento: quedarás como su administrador."
      />
      <FormularioEscuela />
    </>
  );
}