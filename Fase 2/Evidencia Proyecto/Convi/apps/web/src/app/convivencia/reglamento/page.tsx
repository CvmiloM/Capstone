import type { Metadata } from "next";
import { Encabezado } from "@/app/components/formulario";
import { ConsultaReglamento } from "@/app/components/normativa/consulta-reglamento";

export const metadata: Metadata = { title: "Consultar reglamento" };

// PB-117 a PB-119 (HU-101 y HU-102): consulta del reglamento con IA, solo en el portal
// de Convivencia (HU-101 CA3). El proxy de PB-009 exige el perfil y el segundo factor,
// y la API los vuelve a comprobar.
export default function PaginaReglamento() {
  return (
    <>
      <Encabezado
        titulo="Consultar reglamento"
        descripcion="Pregunta lo que necesites sobre el reglamento interno: la IA responde solo con las versiones publicadas y vigentes de tu escuela y muestra el documento, la versión y la página de cada cita."
      />
      <ConsultaReglamento />
    </>
  );
}
