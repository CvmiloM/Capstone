import type { Metadata } from "next";
import { formatearTamano } from "@/app/components/evidencias/opciones";
import { Icono } from "@/app/components/icono";
import { numeroPagina, obtenerDocumentos } from "../../../datos";
import { Paginacion } from "../../../paginacion";
import { Galeria } from "../../../galeria";
import { Descargar, EnlaceCaso, SinAcceso, SinRegistros, SoloLectura, TituloPantalla, fechaCorta, rutaArchivoCaso, rutaPupilo, tieneVistaPrevia } from "../../../piezas";

export const metadata: Metadata = { title: "Documentos y actas" };

// Nombre corto del formato del archivo, para que el apoderado sepa qué va a abrir.
function formato(mime: string, nombre: string) {
  const conocidos: Record<string, string> = {
    "application/pdf": "PDF",
    "image/jpeg": "Imagen JPG",
    "image/png": "Imagen PNG",
    "image/webp": "Imagen WEBP",
    "application/msword": "Word",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.ms-excel": "Excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "text/plain": "Texto",
  };
  const extension = nombre.includes(".") ? nombre.split(".").pop()?.toUpperCase() : undefined;
  return conocidos[mime] ?? extension ?? "Archivo";
}

export default async function Documentos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { id } = await params;
  const datos = await obtenerDocumentos(id, numeroPagina((await searchParams).pagina));
  if (!datos) return <SinAcceso />;
  return <>
    <TituloPantalla titulo="Documentos y actas" />
    <SoloLectura>Puedes ver y descargar los documentos asociados a los casos de {datos.estudiante}</SoloLectura>
    {!datos.elementos.length ? <SinRegistros icono="documentos" titulo="No hay documentos" texto="Aquí aparecerán las actas y los documentos que el equipo de Convivencia adjunte a los casos de tu pupilo" /> :
      <ul className="space-y-3">{datos.elementos.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-tarjeta sm:flex-nowrap sm:p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><Icono nombre="documentos" className="size-5" /></span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-semibold break-words">{d.titulo}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-sm text-muted-foreground"><span>{fechaCorta(d.fecha, datos.zona_horaria)}</span><span aria-hidden="true">·</span><span>{formato(d.tipo_mime, d.archivo)}</span><span aria-hidden="true">·</span><span>{formatearTamano(d.tamano_bytes)}</span><span aria-hidden="true">·</span><span>Caso <EnlaceCaso id={id} casoId={d.caso_id} codigo={d.caso_codigo} /></span></p>
          {d.rectifica && <p className="mt-1 text-xs text-muted-foreground">Corrige un documento anterior del mismo caso</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {tieneVistaPrevia(d.tipo_mime) && <Galeria modo="boton" imagenes={[{ id: d.id, titulo: d.titulo, vista: `${rutaArchivoCaso(id, d.caso_id, d.id)}/vista`, descarga: rutaArchivoCaso(id, d.caso_id, d.id), detalle: `${fechaCorta(d.fecha, datos.zona_horaria)} · ${formatearTamano(d.tamano_bytes)}` }]} />}
          <Descargar href={rutaArchivoCaso(id, d.caso_id, d.id)} titulo={d.titulo} />
        </div>
      </li>)}</ul>}
    <Paginacion total={datos.total} pagina={datos.pagina} ruta={rutaPupilo(id, "documentos")} />
  </>;
}
