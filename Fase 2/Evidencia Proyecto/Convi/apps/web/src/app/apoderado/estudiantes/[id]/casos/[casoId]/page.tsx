import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, claseEnlace, AvisoError } from "@/app/components/formulario";
import { formatearTamano } from "@/app/components/evidencias/opciones";
import { numeroPagina, obtenerDetalle } from "../../../../datos";
import { Estado, Paginacion } from "../../../../paginacion";

export const metadata: Metadata = { title: "Antecedentes del caso" };
const tipos: Record<string, string> = { APERTURA: "Apertura del caso", SITUACION: "Situación registrada", REVISION: "Revisión de Convivencia", ESTADO: "Cambio de estado", ACTUACION: "Encuentro o seguimiento", COMPROMISO: "Compromiso", COMPROMISO_REVISADO: "Revisión de compromiso", COMUNICACION: "Comunicación", EVIDENCIA: "Evidencia", PROTOCOLO: "Protocolo aplicado", ACLARACION: "Solicitud de aclaración", RESPUESTA_ACLARACION: "Respuesta a una aclaración", PARTICIPANTE: "Participante del caso", PLAN: "Plan de intervención", ACCION_PLAN: "Acción del plan" };
export default async function PaginaCaso({ params, searchParams }: { params: Promise<{ id: string; casoId: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { id, casoId } = await params;
  const datos = await obtenerDetalle(id, casoId, numeroPagina((await searchParams).pagina));
  const ruta = `/apoderado/estudiantes/${id}/casos/${casoId}`;
  const fecha = (valor: string) => new Intl.DateTimeFormat("es-CL", { timeZone: datos!.zona_horaria, dateStyle: "medium", timeStyle: "short" }).format(new Date(valor));
  return <>
    <Link href={`/apoderado/estudiantes/${id}`} prefetch={false} className={`text-sm ${claseEnlace}`}>← Volver a los casos del pupilo</Link>
    {!datos ? <div className="mt-5"><AvisoError>El caso no está disponible o tu permiso ya no está vigente, pide al administrador que revise tu acceso</AvisoError></div> : <>
      <div className="mt-5"><Encabezado titulo={datos.caso.titulo} descripcion={`${datos.estudiante.nombre} · ${datos.caso.codigo}`} /></div>
      <section aria-label="Resumen del caso" className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
        <Estado valor={datos.caso.estado} /><p className="mt-3 whitespace-pre-line text-sm">{datos.caso.resumen}</p>
        {datos.caso.categoria && <p className="mt-3 text-sm text-muted-foreground">Categoría: {datos.caso.categoria}</p>}
        {datos.caso.cerrado_en && <p className="mt-2 text-sm text-muted-foreground">Cerrado el {fecha(datos.caso.cerrado_en)}</p>}
      </section>
      <h2 className="text-lg font-semibold">Antecedentes del caso</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">Del más reciente al más antiguo, abre un recuadro para ver el detalle y descargar sus respaldos cuando estén disponibles</p>
      <ul className="space-y-3">{datos.registros.map(r => <li key={`${r.tipo}-${r.id}`}><details className="group rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"><span><span className="block font-semibold">{tipos[r.tipo] ?? "Antecedente"}</span><span className="mt-1 block text-xs text-muted-foreground">{r.fecha ? fecha(r.fecha) : "Fecha sin registrar"}</span></span><span aria-hidden="true" className="text-muted-foreground group-open:rotate-180">⌄</span></summary>
        <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm"><p className="whitespace-pre-line">{r.descripcion}</p>{r.estado && <Estado valor={r.estado} />}
          {r.tipo === "EVIDENCIA" && r.archivo && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-3"><p className="min-w-0 break-all">{r.archivo}{r.tamano_bytes !== null ? ` · ${formatearTamano(r.tamano_bytes)}` : ""}</p><a href={`${ruta}/evidencias/${r.id}`} className={claseEnlace}>Descargar evidencia</a></div>}
        </div>
      </details></li>)}</ul>
      <Paginacion total={datos.total} pagina={datos.pagina} ruta={ruta} />
    </>}
  </>;
}
