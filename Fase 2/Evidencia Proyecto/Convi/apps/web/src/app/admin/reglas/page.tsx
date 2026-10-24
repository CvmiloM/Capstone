import type { Metadata } from "next";
import { obtenerReglas } from "@/app/components/reglas/datos";
import { PantallaReglas } from "@/app/components/reglas/pantalla-reglas";
import { Encabezado } from "@/app/components/formulario";
import { obtenerContextoAdmin } from "../datos";

export const metadata: Metadata = { title: "Reglas de aviso" };

// PB-089 (HU-078): reglas de aviso en el portal de administración. La misma pantalla
// está en el portal de Convivencia.
export default async function PaginaReglas() {
  // Misma comprobación de acceso que el resto del portal.
  await obtenerContextoAdmin();
  const reglas = await obtenerReglas();

  return (
    <>
      <Encabezado
        titulo="Reglas de aviso"
        descripcion="Con estas reglas CONVI avisa cuando se repiten situaciones, vence un plazo o cambian mucho entre dos períodos, y una regla nueva queda en borrador hasta que la actives."
      />
      <PantallaReglas portal="admin" reglas={reglas} />
    </>
  );
}
