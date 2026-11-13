import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { AvisoError } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";
import { numeroPagina, obtenerPortal } from "./datos";
import { Paginacion } from "./paginacion";
import { Iniciales, TituloPantalla, rutaPupilo } from "./piezas";

export const metadata: Metadata = { title: "Apoderado" };

export default async function PaginaApoderado({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const datos = await obtenerPortal(numeroPagina((await searchParams).pagina));
  if (!datos) return <AvisoError>Tu cuenta no tiene acceso a este portal, vuelve a iniciar sesión con tu cuenta de Apoderado</AvisoError>;
  // Con un solo pupilo se entra directo a su portal.
  if (datos.total === 1 && datos.estudiantes.length === 1) redirect(rutaPupilo(datos.estudiantes[0].id));
  return <div className="mx-auto max-w-3xl">
    <p className="mb-2 text-sm text-muted-foreground">{datos.escuela}</p>
    <TituloPantalla titulo={`Hola, ${datos.nombre}`} descripcion={datos.estudiantes.length > 0 ? "Elige a cuál de tus pupilos quieres consultar, todo en modo solo lectura" : undefined} />
    {!datos.estudiantes.length && <div className="rounded-2xl border border-border bg-card p-6 shadow-tarjeta"><h2 className="font-semibold">No hay pupilos con acceso disponible</h2><p className="mt-2 text-sm text-muted-foreground">Pide al administrador de tu escuela que revise el vínculo y el permiso de acceso, puede estar pendiente, vencido o revocado</p></div>}
    <ul className="grid gap-3 sm:grid-cols-2">{datos.estudiantes.map(e => <li key={e.id}>
      <Link href={rutaPupilo(e.id)} prefetch={false} className="presion group flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-tarjeta hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <Iniciales texto={e.iniciales} />
        <span className="min-w-0 flex-1"><span className="block font-semibold break-words">{e.nombre}</span><span className="mt-0.5 block text-sm text-muted-foreground">Código {e.codigo}</span></span>
        <Icono nombre="flecha" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>)}</ul>
    <Paginacion total={datos.total} pagina={datos.pagina} ruta="/apoderado" />
  </div>;
}
