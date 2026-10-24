import type { Metadata } from "next";
import Link from "next/link";
import { obtenerCategorias } from "@/app/components/categorias/datos";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { FormularioRegla } from "@/app/components/reglas/formulario-regla";

export const metadata: Metadata = { title: "Nueva regla de aviso" };

// PB-089 (HU-078 CA6): la regla nueva queda en borrador. Solo se ofrecen las
// categorías activas de la escuela (CA5).
export default async function PaginaNuevaRegla() {
  const categorias = (await obtenerCategorias())
    .filter((c) => c.estado === "ACTIVO")
    .map(({ id, nombre }) => ({ id, nombre }));

  return (
    <>
      <Link href="/convivencia/reglas" className={`text-sm ${claseEnlace}`}>
        ← Reglas de aviso
      </Link>
      <div className="mt-4">
        <Encabezado
          titulo="Nueva regla de aviso"
          descripcion="La regla queda en borrador, después la revisas y la activas para que empiece a generar alertas."
        />
      </div>
      <section className="max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
        <FormularioRegla portal="convivencia" categorias={categorias} />
      </section>
    </>
  );
}
