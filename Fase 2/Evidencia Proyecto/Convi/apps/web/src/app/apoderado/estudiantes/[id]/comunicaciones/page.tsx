import type { Metadata } from "next";
import { Icono } from "@/app/components/icono";
import { numeroPagina, obtenerComunicaciones } from "../../../datos";
import { Paginacion } from "../../../paginacion";
import { ESTADOS_COMUNICACION, EnlaceCaso, SinAcceso, SinRegistros, TIPOS_COMUNICACION, TituloPantalla, fechaCorta, hora, rutaPupilo } from "../../../piezas";

export const metadata: Metadata = { title: "Comunicaciones" };

export default async function Comunicaciones({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { id } = await params;
  const datos = await obtenerComunicaciones(id, numeroPagina((await searchParams).pagina));
  if (!datos) return <SinAcceso />;
  const zona = datos.zona_horaria;
  return <>
    <TituloPantalla titulo="Comunicaciones" descripcion={`Comunicaciones enviadas o registradas por el establecimiento en los casos de ${datos.estudiante}`} />
    {!datos.elementos.length ? <SinRegistros icono="mensaje" titulo="No hay comunicaciones" texto="Aquí aparecerán los correos, llamadas y conversaciones que el equipo de Convivencia registre en los casos de tu pupilo" /> :
      <ul className="space-y-3">{datos.elementos.map((c) => <li key={c.id}>
        {/* Sin asunto, el título es el tipo y no se repite en la línea de apoyo. */}
        <article className="rounded-2xl border border-border bg-card p-4 shadow-tarjeta sm:p-5">
          <div className="flex items-start gap-4">
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary sm:flex"><Icono nombre="mensaje" className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-sans text-base font-semibold break-words">{c.asunto ?? TIPOS_COMUNICACION[c.tipo] ?? "Comunicación"}</h2>
                <span className="flex flex-wrap gap-1.5">
                  {c.para_usted && <span className="rounded-full bg-verde/10 px-2.5 py-1 text-xs font-medium text-verde">Dirigida a ti</span>}
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{ESTADOS_COMUNICACION[c.estado] ?? c.estado}</span>
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-sm text-muted-foreground"><span>{fechaCorta(c.fecha, zona)} · {hora(c.fecha, zona)}</span>{c.asunto && <><span aria-hidden="true">·</span><span>{TIPOS_COMUNICACION[c.tipo] ?? "Comunicación"}</span></>}<span aria-hidden="true">·</span><span>Caso <EnlaceCaso id={id} casoId={c.caso_id} codigo={c.caso_codigo} /></span></p>
              <p className="mt-3 text-sm break-words whitespace-pre-line">{c.resumen}</p>
            </div>
          </div>
        </article>
      </li>)}</ul>}
    <Paginacion total={datos.total} pagina={datos.pagina} ruta={rutaPupilo(id, "comunicaciones")} />
  </>;
}
