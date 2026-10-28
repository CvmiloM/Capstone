import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, claseEnlace } from "@/app/components/formulario";
import {
  ListaHistorial,
  type PaginaHistorial,
} from "@/app/components/auditoria/lista-historial";
import { obtenerFormatoFecha } from "@/app/profesor/datos";
import { pedir } from "../../../datos";
import { AvisoNoDisponible } from "../../../aviso-no-disponible";

export const metadata: Metadata = { title: "Historial del caso" };

export default async function PaginaHistorialCaso({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ antes?: string | string[] }>;
}) {
  const [{ id }, { antes }] = await Promise.all([params, searchParams]);
  const ruta = `/convivencia/casos/${encodeURIComponent(id)}`;
  const cursor =
    antes === undefined
      ? ""
      : `?antes=${encodeURIComponent(typeof antes === "string" ? antes : "invalida")}`;
  const [respuesta, fecha] = await Promise.all([
    pedir<PaginaHistorial>(`${ruta}/historial${cursor}`),
    obtenerFormatoFecha(),
  ]);
  if (!respuesta.ok) return <AvisoNoDisponible volverA={ruta} />;
  return (
    <>
      <Link href={ruta} className={`mb-5 inline-flex text-sm ${claseEnlace}`}>
        ← Volver al caso
      </Link>
      <Encabezado
        titulo="Historial del caso"
        descripcion="Revisa los hechos, las actuaciones y sus cambios, con la persona y la fecha de cada registro"
      />
      <ListaHistorial
        pagina={respuesta.datos}
        ruta={`${ruta}/historial`}
        anteriores={Boolean(antes)}
        fecha={fecha}
      />
    </>
  );
}
