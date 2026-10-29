import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, AvisoError } from "@/app/components/formulario";
import { numeroPagina, obtenerPortal } from "./datos";
import { Paginacion } from "./paginacion";

export const metadata: Metadata = { title: "Apoderado" };

export default async function PaginaApoderado({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const datos = await obtenerPortal(numeroPagina((await searchParams).pagina));
  if (!datos) return <AvisoError>Tu cuenta no tiene acceso a este portal, vuelve a iniciar sesión con tu cuenta de Apoderado</AvisoError>;
  return <>
    <p className="mb-2 text-sm text-muted-foreground">{datos.escuela} · {datos.nombre}</p>
    <Encabezado titulo="Mis pupilos" descripcion={<>Consulta sus casos y antecedentes de convivencia, total transparencia{datos.estudiantes.length > 0 && <span className="mt-2 block">Pulsa sobre cualquiera de tus pupilos para ver más información</span>}</>} />
    {!datos.estudiantes.length && <div className="rounded-2xl border border-border bg-card p-6 shadow-tarjeta"><h2 className="font-semibold">No hay pupilos con acceso disponible</h2><p className="mt-2 text-sm text-muted-foreground">Pide al administrador de tu escuela que revise el vínculo y el permiso de acceso, puede estar pendiente, vencido o revocado</p></div>}
    <ul className="grid gap-4 sm:grid-cols-2">{datos.estudiantes.map(e => <li key={e.id}>
      <Link href={`/apoderado/estudiantes/${e.id}`} prefetch={false} className="block h-full rounded-2xl border border-border bg-card p-6 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <h2 className="text-lg font-semibold">{e.nombre}</h2><p className="mt-1 text-sm text-muted-foreground">Código {e.codigo}</p>
      </Link>
    </li>)}</ul>
    <Paginacion total={datos.total} pagina={datos.pagina} ruta="/apoderado" />
  </>;
}
