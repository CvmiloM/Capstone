import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { formatearTamano } from "@/app/components/evidencias/opciones";
import { claseEnlace } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";
import { obtenerSituacion } from "../../../../datos";
import { Galeria } from "../../../../galeria";
import { Descargar, EnlaceCaso, EstadoSituacion, SinRegistros, TituloPantalla, fechaCorta, hora, rutaArchivoSituacion, rutaPupilo, tieneVistaPrevia } from "../../../../piezas";

export const metadata: Metadata = { title: "Situación" };

export default async function Situacion({ params }: { params: Promise<{ id: string; situacionId: string }> }) {
  const { id, situacionId } = await params;
  const datos = await obtenerSituacion(id, situacionId);
  const volver = <Link href={rutaPupilo(id, "situaciones")} prefetch={false} className={`text-sm ${claseEnlace}`}><span aria-hidden="true">← </span>Volver a las situaciones</Link>;
  if (!datos) return <>{volver}<div className="mt-5"><SinRegistros icono="bandera" titulo="La situación no está disponible" texto="Puede que no sea de tu pupilo, que Convivencia la haya descartado o que tu permiso ya no esté vigente" /></div></>;
  const zona = datos.zona_horaria;
  const imagenes = datos.archivos.filter((a) => tieneVistaPrevia(a.tipo_mime));
  const otros = datos.archivos.filter((a) => !tieneVistaPrevia(a.tipo_mime));
  const campos: [string, ReactNode][] = [
    ["Fecha", `${fechaCorta(datos.fecha, zona)} · ${hora(datos.fecha, zona)}`],
    ["Lugar", datos.lugar ?? "Sin registrar"],
    ["Categoría", datos.categoria ?? "Sin categoría"],
    ["Caso", datos.caso_id && datos.caso_codigo ? <EnlaceCaso key="caso" id={id} casoId={datos.caso_id} codigo={datos.caso_codigo} /> : "No es parte de un caso"],
  ];
  return <>
    {volver}
    <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
      <TituloPantalla titulo={`Situación ${datos.codigo}`} descripcion={`Participa ${datos.estudiante}`} />
      <EstadoSituacion valor={datos.estado} />
    </div>
    <section aria-label="Datos de la situación" className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta sm:p-6">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {campos.map(([titulo, valor]) => <div key={titulo} className="rounded-xl bg-muted px-4 py-3">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</dt>
          <dd className="mt-1 font-medium break-words">{valor}</dd>
        </div>)}
      </dl>
      <h2 className="mt-6 text-lg font-semibold">Relato</h2>
      <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-line">{datos.relato}</p>
    </section>
    <section aria-labelledby="archivos" className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-tarjeta sm:p-6">
      <h2 id="archivos" className="text-lg font-semibold">Imágenes y archivos</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">Los que adjuntaron el profesor o el equipo de Convivencia, abre una imagen para verla en grande o descárgala</p>
      {!datos.archivos.length && <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">No se adjuntaron imágenes ni archivos a esta situación</p>}
      {imagenes.length > 0 && <Galeria imagenes={imagenes.map((a) => ({ id: a.id, titulo: a.titulo, vista: `${rutaArchivoSituacion(id, situacionId, a.id)}/vista`, descarga: rutaArchivoSituacion(id, situacionId, a.id), detalle: `${fechaCorta(a.fecha, zona)} · ${formatearTamano(a.tamano_bytes)}` }))} />}
      {otros.length > 0 && <ul className={`space-y-2 ${imagenes.length ? "mt-4" : ""}`}>{otros.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3">
        <Icono nombre="documentos" className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 basis-40"><span className="block font-medium break-words">{a.titulo}</span><span className="block text-xs text-muted-foreground">{fechaCorta(a.fecha, zona)} · {formatearTamano(a.tamano_bytes)}</span></span>
        <Descargar href={rutaArchivoSituacion(id, situacionId, a.id)} titulo={a.titulo} />
      </li>)}</ul>}
    </section>
  </>;
}
