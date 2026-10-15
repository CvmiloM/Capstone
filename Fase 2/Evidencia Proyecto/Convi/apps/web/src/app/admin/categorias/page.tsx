import type { Metadata } from "next";
import { obtenerCategorias } from "@/app/components/categorias/datos";
import { PantallaCategorias } from "@/app/components/categorias/pantalla-categorias";
import { Encabezado } from "@/app/components/formulario";
import { obtenerContextoAdmin } from "../datos";

export const metadata: Metadata = { title: "Categorías" };

// PB-030 (HU-023): catálogo de categorías en el portal de administración. La
// misma pantalla está en el portal de Convivencia (decisión del PO).
export default async function PaginaCategorias() {
  // Misma comprobación de acceso que el resto del portal.
  await obtenerContextoAdmin();
  const categorias = await obtenerCategorias();

  return (
    <>
      <Encabezado
        titulo="Categorías"
        descripcion="Con estas categorías los profesores y Convivencia clasifican las situaciones. Una categoría inactiva deja de ofrecerse en situaciones nuevas; las anteriores la conservan."
      />
      <PantallaCategorias categorias={categorias} />
    </>
  );
}