import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Icono } from "@/app/components/icono";
import { numeroPagina, obtenerReuniones, type Reunion } from "../../../datos";
import { Paginacion } from "../../../paginacion";
import { EnlaceCaso, SinAcceso, SinRegistros, TIPOS_ENCUENTRO, TituloPantalla, fechaCorta, hora, rutaPupilo } from "../../../piezas";

export const metadata: Metadata = { title: "Reuniones" };

// Una programada cuya fecha ya pasó sin registrarse no se muestra como "Programada".
function estado(r: Reunion) {
  if (r.estado === "REALIZADA") return { texto: "Realizada", tono: "bg-verde/10 text-verde" };
  if (r.estado === "CANCELADA") return { texto: "Cancelada", tono: "bg-muted text-muted-foreground" };
  if (!r.proxima) return { texto: "Pendiente de registro", tono: "bg-muted text-muted-foreground" };
  if (r.estado === "POSPUESTA") return { texto: "Reprogramada", tono: "bg-amarillo/20 text-pizarra" };
  return { texto: "Programada", tono: "bg-primary/10 text-primary" };
}

function horario(r: Reunion, zona: string) {
  const [inicio, fin] = r.estado === "REALIZADA" ? [r.realizado_en, r.fin_real_en] : [r.programado_en, r.fin_programado_en];
  if (!inicio) return null;
  return fin ? `${hora(inicio, zona)} a ${hora(fin, zona)}` : hora(inicio, zona);
}

function Encabezado({ r, zona }: { r: Reunion; zona: string }) {
  const e = estado(r);
  const h = horario(r, zona);
  return <span className="flex w-full items-center gap-4">
    <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${r.proxima ? "bg-accent text-primary" : "bg-muted text-muted-foreground"}`}><Icono nombre="anios" className="size-5" /></span>
    <span className="min-w-0 flex-1">
      <span className="block font-semibold">{fechaCorta(r.fecha, zona)}{h ? <span className="whitespace-nowrap"> · {h}</span> : ""}</span>
      <span className="mt-0.5 block text-sm break-words text-muted-foreground">{TIPOS_ENCUENTRO[r.tipo] ?? "Encuentro"} · {r.lugar ?? "Lugar por confirmar"}</span>
      {/* En el celular el estado va debajo, para no apretar la fecha y el lugar. */}
      <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium sm:hidden ${e.tono}`}>{e.texto}</span>
    </span>
    <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${e.tono}`}>{e.texto}</span>
  </span>;
}

function Detalle({ id, r, zona }: { id: string; r: Reunion; zona: string }) {
  const campos: [string, ReactNode][] = [
    ["Motivo", r.motivo],
    ["Profesional", r.profesional ?? "Sin registrar"],
    ["Fecha", fechaCorta(r.fecha, zona)],
    ["Hora", horario(r, zona) ?? "Sin registrar"],
    ["Lugar", r.lugar ?? "Por confirmar"],
    ["Caso", <EnlaceCaso key="caso" id={id} casoId={r.caso_id} codigo={r.caso_codigo} />],
  ];
  return <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
    {campos.map(([titulo, valor]) => <div key={titulo} className={titulo === "Motivo" ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className="mt-0.5 font-medium break-words whitespace-pre-line">{valor}</dd>
    </div>)}
  </dl>;
}

export default async function Reuniones({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { id } = await params;
  const datos = await obtenerReuniones(id, numeroPagina((await searchParams).pagina));
  if (!datos) return <SinAcceso />;
  const zona = datos.zona_horaria;
  const proximas = datos.elementos.filter((r) => r.proxima);
  const anteriores = datos.elementos.filter((r) => !r.proxima);
  return <>
    <TituloPantalla titulo="Reuniones" descripcion={`Entrevistas, reuniones y seguimientos de los casos de ${datos.estudiante}`} />
    {!datos.elementos.length && <SinRegistros icono="anios" titulo="No hay reuniones registradas" texto="Cuando el equipo de Convivencia programe una entrevista, una reunión o un seguimiento en los casos de tu pupilo, aparecerá aquí con su fecha y lugar" />}
    {proximas.length > 0 && <section aria-labelledby="proximas" className="mb-6">
      <h2 id="proximas" className="mb-3 text-lg font-semibold">Próximas</h2>
      <ul className="space-y-3">{proximas.map((r) => <li key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-tarjeta sm:p-5">
        <Encabezado r={r} zona={zona} />
        <div className="mt-4 border-t border-border pt-4"><Detalle id={id} r={r} zona={zona} /></div>
      </li>)}</ul>
    </section>}
    {anteriores.length > 0 && <section aria-labelledby="anteriores">
      <h2 id="anteriores" className="mb-3 text-lg font-semibold">Anteriores</h2>
      <ul className="space-y-3">{anteriores.map((r) => <li key={r.id}>
        <details className="group rounded-2xl border border-border bg-card shadow-tarjeta">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5 [&::-webkit-details-marker]:hidden">
            <Encabezado r={r} zona={zona} />
            <Icono nombre="flecha" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="mx-4 border-t border-border pt-4 pb-4 sm:mx-5 sm:pb-5"><Detalle id={id} r={r} zona={zona} /></div>
        </details>
      </li>)}</ul>
    </section>}
    <Paginacion total={datos.total} pagina={datos.pagina} ruta={rutaPupilo(id, "reuniones")} />
  </>;
}
