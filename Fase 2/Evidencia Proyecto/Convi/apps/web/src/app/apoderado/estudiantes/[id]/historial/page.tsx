import type { Metadata } from "next";
import type { ReactNode } from "react";
import { numeroPagina, obtenerHistorial, type Evento } from "../../../datos";
import { Paginacion } from "../../../paginacion";
import {
  Descargar, EnlaceCaso, ESTADOS_CASO, ESTADOS_COMPROMISO, ESTADOS_COMUNICACION, ESTADOS_SITUACION, SinAcceso, SinRegistros,
  SoloLectura, TIPOS_COMUNICACION, TIPOS_ENCUENTRO, TituloPantalla, fechaCorta, rutaPupilo,
} from "../../../piezas";

export const metadata: Metadata = { title: "Historial de convivencia" };

// Color del punto en la línea de tiempo y de la insignia de cada tipo de registro.
const ESTILOS: Record<string, { punto: string; insignia: string }> = {
  SITUACION: { punto: "border-naranjo", insignia: "border-naranjo/40 text-[color:var(--naranjo-sombra)]" },
  CASO: { punto: "border-primary", insignia: "border-primary/30 text-primary" },
  CIERRE: { punto: "border-grafito", insignia: "border-grafito/40 text-grafito" },
  ACTUACION: { punto: "border-verde", insignia: "border-verde/40 text-verde" },
  COMPROMISO: { punto: "border-amarillo", insignia: "border-amarillo text-pizarra" },
  COMUNICACION: { punto: "border-pizarra", insignia: "border-pizarra/40 text-pizarra" },
  DOCUMENTO: { punto: "border-ring", insignia: "border-ring/40 text-primary" },
};
const REALIZADAS: Record<string, string> = { ENTREVISTA: "Entrevista realizada", REUNION: "Reunión realizada", MEDIACION: "Mediación realizada", INTERVENCION: "Intervención realizada", SEGUIMIENTO: "Seguimiento realizado", ACOMPANAMIENTO: "Acompañamiento realizado" };

// Qué dice cada registro: insignia, frase principal y datos de apoyo.
// Los códigos (SIT-2026-00087, CASO-2026-00014) no se parten entre dos líneas.
const codigo = (texto: string) => <span className="whitespace-nowrap">{texto}</span>;

function contenido(id: string, r: Evento): { insignia: string; titulo: ReactNode; apoyo: ReactNode[] } {
  const caso = r.caso_id && r.caso_codigo ? <>Caso <EnlaceCaso id={id} casoId={r.caso_id} codigo={r.caso_codigo} /></> : null;
  switch (r.tipo) {
    case "SITUACION":
      return { insignia: "Situación", titulo: <>Situación {codigo(r.titulo)}{r.detalle ? ` · ${r.detalle}` : ""}</>, apoyo: [r.estado ? ESTADOS_SITUACION[r.estado] ?? null : null, caso] };
    case "CASO":
      return { insignia: "Caso iniciado", titulo: <>Caso {codigo(r.titulo)}{r.detalle ? ` · ${r.detalle}` : ""}</>, apoyo: [r.responsable ? `Responsable: ${r.responsable}` : null, r.estado ? `Estado actual: ${ESTADOS_CASO[r.estado] ?? r.estado}` : null, caso && <EnlaceCaso id={id} casoId={r.caso_id!} codigo="Ver el caso" />] };
    case "CIERRE":
      return { insignia: "Caso cerrado", titulo: <>Se cerró el caso {codigo(r.titulo)}</>, apoyo: [r.detalle, caso] };
    case "ACTUACION":
      return { insignia: TIPOS_ENCUENTRO[r.titulo] ?? "Encuentro", titulo: `${REALIZADAS[r.titulo] ?? "Encuentro realizado"}${r.detalle ? ` · ${r.detalle}` : ""}`, apoyo: [r.responsable ? `Responsable: ${r.responsable}` : null, caso] };
    case "COMPROMISO":
      return { insignia: "Compromiso", titulo: r.detalle ?? "Compromiso registrado", apoyo: [r.estado ? `Estado: ${ESTADOS_COMPROMISO[r.estado] ?? r.estado}` : null, caso] };
    case "COMUNICACION":
      return { insignia: "Comunicación", titulo: `${TIPOS_COMUNICACION[r.titulo] ?? "Comunicación"}${r.detalle ? ` · ${r.detalle}` : ""}`, apoyo: [r.estado ? ESTADOS_COMUNICACION[r.estado] ?? null : null, caso] };
    default:
      return { insignia: "Documento", titulo: r.titulo, apoyo: [caso] };
  }
}

export default async function Historial({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { id } = await params;
  const datos = await obtenerHistorial(id, numeroPagina((await searchParams).pagina));
  if (!datos) return <SinAcceso />;
  const zona = datos.zona_horaria;
  return <>
    <TituloPantalla titulo="Historial de convivencia" />
    <SoloLectura>Estás viendo el historial de convivencia de {datos.estudiante} en modo solo lectura</SoloLectura>
    {!datos.elementos.length ? <SinRegistros icono="historial" titulo="Todavía no hay registros" texto="Aquí aparecerán las situaciones en que participa tu pupilo y lo que se haga en sus casos: encuentros, compromisos, comunicaciones y documentos" /> :
      <ol aria-label="Registros, del más reciente al más antiguo" className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-0.5 before:rounded-full before:bg-border">
        {datos.elementos.map((r) => {
          const estilo = ESTILOS[r.tipo] ?? ESTILOS.DOCUMENTO;
          const { insignia, titulo, apoyo } = contenido(id, r);
          const datosApoyo = apoyo.filter(Boolean);
          return <li key={`${r.tipo}-${r.id}`} className="relative pl-7">
            <span aria-hidden="true" className={`absolute top-6 left-0 size-4 rounded-full border-[3px] bg-card ${estilo.punto}`} />
            <article className="rounded-2xl border border-border bg-card p-4 shadow-tarjeta sm:flex sm:gap-5 sm:p-5">
              <p className="text-xs font-semibold text-muted-foreground sm:w-24 sm:shrink-0 sm:pt-1">{r.fecha ? fechaCorta(r.fecha, zona) : "Sin fecha"}</p>
              <div className="mt-2 min-w-0 flex-1 sm:mt-0">
                <span className={`inline-flex rounded-full border bg-card px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider ${estilo.insignia}`}>{insignia}</span>
                <h2 className="mt-2 line-clamp-3 font-sans text-[0.95rem] font-medium break-words text-foreground">{titulo}</h2>
                {datosApoyo.length > 0 && <p className="mt-1 flex flex-wrap gap-x-1.5 text-sm text-muted-foreground">{datosApoyo.map((d, i) => <span key={i} className="flex gap-x-1.5">{i > 0 && <span aria-hidden="true">·</span>}<span>{d}</span></span>)}</p>}
                {r.documentos.length > 0 && <ul aria-label="Documentos" className="mt-3 flex flex-wrap gap-2">{r.documentos.map((d) => <li key={d.id} className="max-w-full"><Descargar id={id} casoId={d.caso_id} documentoId={d.id} titulo={d.titulo} compacto /></li>)}</ul>}
              </div>
            </article>
          </li>;
        })}
      </ol>}
    <Paginacion total={datos.total} pagina={datos.pagina} ruta={rutaPupilo(id, "historial")} />
  </>;
}
