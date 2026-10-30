import Link from "next/link";
import { pedir } from "../datos";
import { claseBotonPrimario, claseEnlace } from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";

type Agenda = {
  mes: string;
  pagina: number;
  total: number;
  filas: {
    id: string;
    caso_id: string;
    codigo: string;
    titulo: string;
    objetivo: string;
    estado: string;
    fecha: string;
    responsable: string;
  }[];
};
export const metadata = { title: "Agenda de seguimientos" };
export default async function AgendaSeguimientos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; pagina?: string }>;
}) {
  const filtros = await searchParams;
  const consulta = new URLSearchParams({
    mes: filtros.mes ?? "",
    pagina: filtros.pagina ?? "1",
  });
  const r = await pedir<Agenda>(`/convivencia/seguimientos?${consulta}`);
  if (!r.ok) return <AvisoNoDisponible volverA="/convivencia/casos" />;
  const a = r.datos;
  const enlace = (pagina: number) =>
    `?${new URLSearchParams({ mes: a.mes, pagina: String(pagina) })}`;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-titulo text-3xl font-semibold">
          Agenda de seguimientos
        </h1>
        <p className="mt-2 text-muted-foreground">
          Consulta las fechas del mes, abre un seguimiento para trabajar en su
          caso
        </p>
      </header>
      <form className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="mes" className="mb-2 block text-sm font-medium">
            Mes
          </label>
          <input
            id="mes"
            name="mes"
            type="month"
            defaultValue={a.mes}
            className="rounded-xl border border-input bg-card px-3 py-2 focus-visible:outline-ring"
          />
        </div>
        <button type="submit" className={claseBotonPrimario}>
          Ver mes
        </button>
      </form>
      <p className="text-sm text-muted-foreground">
        {a.total} seguimientos, se muestran hasta 50 por página
      </p>
      <div className="space-y-3">
        {a.filas.map((s) => (
          <Link
            key={s.id}
            href={`/convivencia/casos/${s.caso_id}?seccion=seguimientos#seguimiento-${s.id}`}
            className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-medium">{s.objetivo}</span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs">
                {{
                  PLANIFICADA: "Planificado",
                  POSPUESTA: "Pospuesto",
                  REALIZADA: "Realizado",
                  CANCELADA: "Cancelado",
                }[s.estado] ?? s.estado}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {s.fecha}, {s.responsable}
            </p>
            <p className="mt-1 text-sm">
              {s.codigo}, {s.titulo}
            </p>
          </Link>
        ))}
      </div>
      {a.filas.length === 0 && (
        <p className="rounded-2xl border border-border p-6 text-muted-foreground">
          No hay seguimientos en este mes
        </p>
      )}
      <nav
        aria-label="Páginas de seguimientos"
        className="flex items-center gap-5"
      >
        {a.pagina > 1 && (
          <Link href={enlace(a.pagina - 1)} className={claseEnlace}>
            Anterior
          </Link>
        )}
        <span className="text-sm">Página {a.pagina}</span>
        {a.pagina * 50 < a.total && (
          <Link href={enlace(a.pagina + 1)} className={claseEnlace}>
            Siguiente
          </Link>
        )}
      </nav>
    </div>
  );
}
