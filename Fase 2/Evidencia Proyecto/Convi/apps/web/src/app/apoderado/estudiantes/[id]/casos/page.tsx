import type { Metadata } from "next";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Icono } from "@/app/components/icono";
import { numeroPagina, obtenerCasos } from "../../../datos";
import { Paginacion } from "../../../paginacion";
import { EstadoCaso, SinAcceso, SinRegistros, TituloPantalla, diaCorto, rutaPupilo } from "../../../piezas";

export const metadata: Metadata = { title: "Casos de mi pupilo" };

export default async function CasosPupilo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { id } = await params;
  const datos = await obtenerCasos(id, numeroPagina((await searchParams).pagina));
  if (!datos) return <SinAcceso />;
  return <>
    <TituloPantalla titulo="Casos" descripcion={`Casos en que participa ${datos.estudiante.nombre}, incluidos los cerrados, abre uno para ver sus antecedentes`} />
    {!datos.casos.length ? <SinRegistros icono="carpeta" titulo="No hay casos registrados" texto="Cuando el equipo de Convivencia abra un caso en que participe tu pupilo, aparecerá aquí con todos sus antecedentes" /> :
      <ul className="space-y-3">{datos.casos.map((c) => <li key={c.id}>
        <Link href={rutaPupilo(id, `casos/${c.id}`)} prefetch={false} className="presion group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-tarjeta hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:p-5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary sm:flex"><Icono nombre="carpeta" className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-start justify-between gap-2"><span className="font-semibold break-words">{c.titulo}</span><EstadoCaso valor={c.estado} /></span>
            <span className="mt-1 block text-sm text-muted-foreground">{c.codigo} · Inicio {diaCorto(c.fecha_inicio)}{c.categoria ? ` · ${c.categoria}` : ""}</span>
          </span>
          <Icono nombre="flecha" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </li>)}</ul>}
    <Paginacion total={datos.total} pagina={datos.pagina} ruta={rutaPupilo(id, "casos")} />
  </>;
}
