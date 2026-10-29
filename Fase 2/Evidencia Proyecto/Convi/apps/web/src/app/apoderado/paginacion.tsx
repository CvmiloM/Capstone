import Link from "next/link";
import { claseEnlace } from "@/app/components/formulario";

export function Paginacion({ total, pagina, ruta }: { total: number; pagina: number; ruta: string }) {
  const paginas = Math.max(1, Math.ceil(total / 50));
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
    <p>{total} {total === 1 ? "registro" : "registros"}, hasta 50 por página</p>
    {paginas > 1 && <nav aria-label="Páginas" className="flex items-center gap-4">
      {pagina > 1 && <Link href={`${ruta}?pagina=${pagina - 1}`} prefetch={false} className={claseEnlace}>← Anterior</Link>}
      <span>Página {pagina} de {paginas}</span>
      {pagina < paginas && <Link href={`${ruta}?pagina=${pagina + 1}`} prefetch={false} className={claseEnlace}>Siguiente →</Link>}
    </nav>}
  </div>;
}

export function Estado({ valor }: { valor: string }) {
  const nombres: Record<string, string> = { EN_ANALISIS: "En análisis", EN_REVISION: "En revisión", EN_INTERVENCION: "En intervención", EN_SEGUIMIENTO: "En seguimiento", CERRADO: "Cerrado", REABIERTO: "Reabierto", EN_PROGRESO: "En progreso" };
  return <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium capitalize text-primary">{nombres[valor] ?? valor.toLowerCase().replaceAll("_", " ")}</span>;
}
