import type { Metadata } from "next";
import { Encabezado } from "@/app/components/formulario";

export const metadata: Metadata = { title: "Registrar establecimiento" };

// Destino del enlace de confirmación; la sesión ya quedó iniciada en cookies.
// TODO(PB-002): formulario con los datos de la escuela. La API llama a
// convi.registrar_primer_administrador con los nombres, apellidos y teléfono
// que el registro (PB-001) dejó en los metadatos de la identidad.
export default function PaginaRegistroEscuela() {
  return (
    <>
      <Encabezado
        titulo="Correo verificado"
        descripcion="Tu cuenta quedó creada. El siguiente paso es registrar los datos de tu establecimiento."
      />
      <div
        role="status"
        className="rounded-lg border border-primary/15 bg-accent p-5 text-sm"
      >
        Muy pronto podrás completar aquí los datos de tu establecimiento.
      </div>
    </>
  );
}