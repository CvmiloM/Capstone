import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, claseEnlace, AvisoError } from "@/app/components/formulario";
import { numeroPagina, obtenerCasos } from "../../datos";
import { Estado, Paginacion } from "../../paginacion";

export const metadata: Metadata = { title: "Casos de mi pupilo" };
export default async function PaginaEstudiante({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { id } = await params;
  const datos = await obtenerCasos(id, numeroPagina((await searchParams).pagina));
  return <>
    <Link href="/apoderado" prefetch={false} className={`text-sm ${claseEnlace}`}>← Volver a mis pupilos</Link>
    {!datos ? <div className="mt-5"><AvisoError>No tienes acceso disponible a este pupilo, pide al administrador que revise tu permiso</AvisoError></div> : <>
      <div className="mt-5"><Encabezado titulo={datos.estudiante.nombre} descripcion={<>Casos relacionados con tu pupilo, incluidos los cerrados{datos.casos.length > 0 && <span className="mt-2 block">Pulsa sobre cualquiera de los casos para ver más detalles</span>}</>} /></div>
      {!datos.casos.length && <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">No hay casos registrados para este pupilo</p>}
      <ul className="space-y-3">{datos.casos.map(c => <li key={c.id}><Link href={`/apoderado/estudiantes/${id}/casos/${c.id}`} prefetch={false} className="block rounded-2xl border border-border bg-card p-5 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="font-semibold">{c.titulo}</h2><Estado valor={c.estado} /></div>
        <p className="mt-2 text-sm text-muted-foreground">{c.codigo} · Inicio {new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", dateStyle: "medium" }).format(new Date(`${c.fecha_inicio}T00:00:00Z`))}{c.categoria ? ` · ${c.categoria}` : ""}</p>
      </Link></li>)}</ul>
      <Paginacion total={datos.total} pagina={datos.pagina} ruta={`/apoderado/estudiantes/${id}`} />
    </>}
  </>;
}
