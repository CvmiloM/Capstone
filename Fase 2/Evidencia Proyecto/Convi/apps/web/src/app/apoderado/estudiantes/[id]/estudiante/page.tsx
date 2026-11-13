import type { Metadata } from "next";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { claseBotonPrimario } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";
import { obtenerResumen } from "../../../datos";
import { Iniciales, Matricula, SinAcceso, TituloPantalla, fechaCorta, hora, rutaPupilo } from "../../../piezas";

export const metadata: Metadata = { title: "Mi estudiante" };

export default async function MiEstudiante({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = await obtenerResumen(id);
  if (!datos) return <SinAcceso />;
  const { estudiante: e, conteos: c, zona_horaria: zona, proxima_reunion: reunion } = datos;
  const campos: [string, string | null][] = [
    ["Nivel", e.nivel],
    ["Sección", e.seccion],
    ["Año", e.anio ? String(e.anio) : null],
    ["Profesor jefe", e.profesor_jefe],
    ["Establecimiento", datos.escuela],
    ["Código de estudiante", e.codigo],
  ];
  const cifras = [
    { valor: c.situaciones, texto: "Situaciones registradas", tono: "bg-naranjo/10", cifra: "text-[color:var(--naranjo-sombra)]" },
    { valor: c.casos_activos, texto: "Casos activos", tono: "bg-accent", cifra: "text-primary" },
    { valor: c.casos_cerrados, texto: "Casos cerrados", tono: "bg-muted", cifra: "text-foreground" },
    { valor: c.encuentros_realizados, texto: "Encuentros realizados", tono: "bg-verde/10", cifra: "text-verde" },
  ];
  return <>
    <TituloPantalla titulo="Mi estudiante" />
    <section aria-labelledby="nombre-estudiante" className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta sm:p-7">
      <div className="flex items-center gap-4">
        <Iniciales texto={e.iniciales} grande />
        <div className="min-w-0">
          <h2 id="nombre-estudiante" className="text-xl font-semibold">{e.nombre}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{[e.curso, datos.escuela].filter(Boolean).join(" · ")}</p>
          <div className="mt-2"><Matricula estado={e.matricula} /></div>
        </div>
      </div>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {campos.map(([titulo, valor]) => <div key={titulo} className="rounded-xl bg-muted px-4 py-3">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</dt>
          <dd className={`mt-1 font-medium ${valor ? "" : "text-muted-foreground"}`}>{valor ?? "Sin registrar"}</dd>
        </div>)}
      </dl>
    </section>
    <section aria-labelledby="resumen-convivencia" className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-tarjeta sm:p-7">
      <h2 id="resumen-convivencia" className="text-lg font-semibold">Resumen de convivencia</h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cifras.map((x) => <li key={x.texto} className={`rounded-xl px-3 py-4 text-center ${x.tono}`}>
          <span className={`block font-titulo text-3xl font-semibold tabular-nums ${x.cifra}`}>{x.valor}</span>
          <span className="mt-1 block text-xs font-medium text-foreground">{x.texto}</span>
        </li>)}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
        <p className="flex items-center gap-2 text-sm"><Icono nombre="anios" className="size-4 shrink-0 text-muted-foreground" />{reunion ? <span>Próximo encuentro: <strong className="font-semibold">{fechaCorta(reunion.fecha, zona)} · {hora(reunion.fecha, zona)}</strong></span> : <span>No hay encuentros programados</span>}</p>
        <Link href={rutaPupilo(id, "historial")} prefetch={false} className={`${claseBotonPrimario} gap-1.5`}>Ver historial completo<Icono nombre="flecha" className="size-4" /></Link>
      </div>
    </section>
  </>;
}
