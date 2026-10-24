import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerCategorias } from "@/app/components/categorias/datos";
import { obtenerRegla } from "@/app/components/reglas/datos";
import { PantallaRegla } from "@/app/components/reglas/pantalla-regla";

export const metadata: Metadata = { title: "Regla de aviso" };

// PB-089 (HU-078): una versión de una regla con sus acciones y su historial
// de versiones. Una regla de otra escuela no se encuentra.
export default async function PaginaRegla({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    guardada?: string | string[];
    activada?: string | string[];
    archivada?: string | string[];
  }>;
}) {
  const [{ id }, parametros] = await Promise.all([params, searchParams]);
  const detalle = await obtenerRegla(id);
  if (!detalle) notFound();
  const categorias = (await obtenerCategorias())
    .filter((c) => c.estado === "ACTIVO")
    .map(({ id: categoria, nombre }) => ({ id: categoria, nombre }));
  const aviso = parametros.activada
    ? "activada"
    : parametros.archivada
      ? "archivada"
      : parametros.guardada
        ? "guardada"
        : null;

  return <PantallaRegla portal="convivencia" detalle={detalle} categorias={categorias} aviso={aviso} />;
}
