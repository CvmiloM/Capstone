import { Suspense, type ReactNode } from "react";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { obtenerResumen } from "../../datos";
import { Iniciales, Matricula } from "../../piezas";
import { Navegacion } from "./navegacion";

// Portal de un pupilo: a la izquierda su ficha y el menú, a la derecha cada
// pantalla. En el celular la ficha queda arriba y el menú pasa a pestañas que
// se deslizan de lado. La ficha y el menú esperan sus datos en su propio
// Suspense, así la pantalla no queda en blanco mientras llegan.
export default function LayoutPupilo({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  return <div className="grid gap-4 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
    <aside aria-label="Pupilo" className="min-w-0 space-y-3 lg:sticky lg:top-24">
      <Suspense fallback={<EsqueletoFicha />}><Ficha params={params} /></Suspense>
      <Suspense fallback={<div aria-hidden="true" className="h-11 animate-pulse rounded-full bg-muted lg:h-96 lg:rounded-2xl" />}><Navegacion /></Suspense>
    </aside>
    <div className="min-w-0">{children}</div>
  </div>;
}

async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = await obtenerResumen(id);
  if (!datos) return null;
  const e = datos.estudiante;
  return <section aria-label="Ficha del pupilo" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-tarjeta lg:flex-col lg:p-5 lg:text-center">
    <Iniciales texto={e.iniciales} />
    <div className="min-w-0 flex-1 lg:w-full lg:flex-none">
      <p className="font-semibold break-words">{e.nombre}</p>
      <p className="text-sm text-muted-foreground">{e.curso ?? "Sin curso registrado"}</p>
      <div className="mt-1.5"><Matricula estado={e.matricula} /></div>
      {datos.pupilos > 1 && <Link href="/apoderado" prefetch={false} className="mt-2 inline-block rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Cambiar de pupilo</Link>}
    </div>
  </section>;
}

function EsqueletoFicha() {
  return <div aria-hidden="true" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 lg:flex-col lg:p-5">
    <span className="size-12 animate-pulse rounded-full bg-muted" />
    <span className="flex flex-1 flex-col gap-2 lg:items-center"><span className="h-4 w-32 animate-pulse rounded bg-muted" /><span className="h-3 w-20 animate-pulse rounded bg-muted" /></span>
  </div>;
}
