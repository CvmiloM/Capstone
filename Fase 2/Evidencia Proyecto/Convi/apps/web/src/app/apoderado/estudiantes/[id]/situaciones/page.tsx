import type { Metadata } from "next";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Icono } from "@/app/components/icono";
import { numeroPagina, obtenerSituaciones } from "../../../datos";
import { Paginacion } from "../../../paginacion";
import { EstadoSituacion, SinAcceso, SinRegistros, SoloLectura, TituloPantalla, fechaCorta, hora, plural, rutaPupilo } from "../../../piezas";

export const metadata: Metadata = { title: "Situaciones" };

// Situaciones en que participa el pupilo, registradas por profesores o por
// Convivencia, con su relato y sus imágenes (decisión del PO).
export default async function Situaciones({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { id } = await params;
  const datos = await obtenerSituaciones(id, numeroPagina((await searchParams).pagina));
  if (!datos) return <SinAcceso />;
  const zona = datos.zona_horaria;
  return <>
    <TituloPantalla titulo="Situaciones" descripcion="Situaciones registradas por profesores o por el equipo de Convivencia, abre una para ver su relato y sus imágenes" />
    <SoloLectura>Estás viendo las situaciones en que participa {datos.estudiante} en modo solo lectura</SoloLectura>
    {!datos.elementos.length ? <SinRegistros icono="bandera" titulo="No hay situaciones registradas" texto="Cuando un profesor o el equipo de Convivencia registre una situación en que participe tu pupilo, aparecerá aquí con su relato y sus imágenes" /> :
      <ul className="space-y-3">{datos.elementos.map((s) => <li key={s.id}>
        <Link href={rutaPupilo(id, `situaciones/${s.id}`)} prefetch={false} className="presion group flex items-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-tarjeta hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:p-5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-naranjo/10 text-[color:var(--naranjo-sombra)] sm:flex"><Icono nombre="bandera" className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-start justify-between gap-2"><span className="font-semibold whitespace-nowrap">Situación {s.codigo}</span><EstadoSituacion valor={s.estado} /></span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{[`${fechaCorta(s.fecha, zona)} · ${hora(s.fecha, zona)}`, s.lugar, s.categoria].filter(Boolean).join(" · ")}</span>
            <span className="mt-2 line-clamp-2 text-sm break-words text-foreground">{s.relato}</span>
            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
              {s.imagenes > 0 && <span className="inline-flex items-center gap-1"><Icono nombre="imagen" className="size-3.5" />{plural(s.imagenes, "imagen", "imágenes")}</span>}
              {s.archivos > s.imagenes && <span className="inline-flex items-center gap-1"><Icono nombre="documentos" className="size-3.5" />{plural(s.archivos - s.imagenes, "archivo", "archivos")}</span>}
              {s.caso_codigo && <span className="whitespace-nowrap">Caso {s.caso_codigo}</span>}
            </span>
          </span>
          <Icono nombre="flecha" className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </li>)}</ul>}
    <Paginacion total={datos.total} pagina={datos.pagina} ruta={rutaPupilo(id, "situaciones")} />
  </>;
}
