import type { Metadata } from "next";
import { obtenerCategorias } from "@/app/components/categorias/datos";
import { PantallaCategorias } from "@/app/components/categorias/pantalla-categorias";
import { Encabezado } from "@/app/components/formulario";

export const metadata: Metadata = { title: "Categorías" };

// PB-030 (HU-023): catálogo de categorías en el portal de Convivencia. El
// proxy de PB-009 exige el perfil y el segundo factor, y la API los vuelve a
// comprobar. La misma pantalla está en el portal de administración.
export default async function PaginaCategorias() {
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