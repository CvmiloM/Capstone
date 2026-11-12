import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Encabezado, claseEnlace } from "@/app/components/formulario";
import { pedir } from "../../datos";
import { AvisoNoDisponible } from "../../aviso-no-disponible";

type Pendientes = {
  total: number;
  pagina: number;
  filas: {
    id: string;
    caso_id: string;
    codigo: string;
    titulo: string;
    fecha: string;
  }[];
};
export const metadata = { title: "Seguimientos por realizar" };

export default async function SeguimientosPendientes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const pagina = typeof p.pagina === "string" ? p.pagina : "1";
  const r = await pedir<Pendientes>(
    `/convivencia/jornada/seguimientos?${new URLSearchParams({ pagina })}`,
  );
  if (!r.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const d = r.datos,
    paginas = Math.max(1, Math.ceil(d.total / 20));
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/convivencia" className={claseEnlace}>
        Volver a Tu jornada
      </Link>
      <Encabezado
        titulo="Seguimientos por realizar"
        descripcion="Programados hasta hoy y todavía pendientes, incluidos los de meses anteriores."
      />
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-5">
        {d.filas.map((f) => (
          <li key={f.id}>
            <Link
              className="block rounded-lg py-5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              href={`/convivencia/casos/${f.caso_id}?seccion=seguimientos#seguimiento-${f.id}`}
            >
              <p className="font-medium">{f.titulo}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {f.codigo} · Programado para {f.fecha}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {!d.filas.length && (
        <p className="text-sm text-muted-foreground">
          No hay seguimientos pendientes en esta página.
        </p>
      )}
      <nav
        aria-label="Páginas de seguimientos"
        className="flex flex-wrap justify-between gap-4 text-sm"
      >
        <p>
          {d.total} registros, página {d.pagina} de {paginas}, hasta 20 por
          página
        </p>
        <div className="flex gap-4">
          {d.pagina > 1 && (
            <Link className={claseEnlace} href={`?pagina=${d.pagina - 1}`}>
              Anterior
            </Link>
          )}
          {d.pagina < paginas && (
            <Link className={claseEnlace} href={`?pagina=${d.pagina + 1}`}>
              Siguiente
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
