import Link from "next/link";
import type { ReactNode } from "react";
import { claseBotonPrimario, claseBotonSecundario } from "../formulario";

export type PaginaHistorial = {
  eventos: {
    id: string;
    tipo: string;
    recurso: string;
    referencia: string | null;
    fecha: string;
    autor: string | null;
    resultado: string;
    descripcion?: string | null;
    fecha_evento?: string | null;
    referencia_nombre?: string | null;
    resumen?: string;
  }[];
  siguiente: string | null;
  opciones: {
    acciones: Record<string, string>;
    recursos: Record<string, string>;
    resultados: Record<string, string>;
  };
};

export function ListaHistorial({
  pagina,
  ruta,
  anteriores,
  fecha,
  filtros,
}: {
  pagina: PaginaHistorial;
  ruta: string;
  anteriores: boolean;
  fecha: (valor: string) => string;
  filtros?: ReactNode;
}) {
  return (
    <div className="max-w-4xl space-y-5">
      <p className="text-sm text-muted-foreground">
        Del registro más reciente al más antiguo, pulsa un recuadro para ver sus
        detalles
      </p>
      {filtros}
      <p className="text-xs text-muted-foreground">
        {pagina.eventos.length}{" "}
        {pagina.eventos.length === 1 ? "registro" : "registros"} en esta página,
        máximo 50
      </p>
      {pagina.eventos.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No hay registros para mostrar en esta página
        </p>
      ) : (
        <ol className="space-y-3" aria-label="Registros del historial">
          {pagina.eventos.map((evento) => (
            <li key={`${evento.id}-${evento.tipo}-${evento.fecha}`}>
              <details className="group rounded-2xl border border-border bg-card">
                <summary className="cursor-pointer list-none rounded-2xl p-5 outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <span className="flex flex-wrap items-start justify-between gap-3">
                    <span className="font-semibold">
                      {pagina.opciones.acciones[evento.tipo] ??
                        "Acción registrada"}
                    </span>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {pagina.opciones.recursos[evento.recurso] ?? "Registro"}
                    </span>
                  </span>
                  {evento.referencia_nombre && (
                    <span className="mt-2 block break-words text-sm font-medium">
                      {evento.referencia_nombre}
                    </span>
                  )}
                  <span className="mt-2 block text-sm">
                    Registrado por: {evento.autor ?? "Proceso del sistema"}
                  </span>
                  <time
                    dateTime={evento.fecha}
                    className="mt-1 block text-sm text-muted-foreground"
                  >
                    {fecha(evento.fecha)}
                  </time>
                  <span className="mt-3 block text-xs font-medium text-primary">
                    Ver detalles{" "}
                    <span
                      aria-hidden="true"
                      className="inline-block transition-transform group-open:rotate-180"
                    >
                      ⌄
                    </span>
                  </span>
                </summary>
                <div className="space-y-3 border-t border-border px-5 py-4 text-sm">
                  {evento.resumen && <p>{evento.resumen}</p>}
                  {evento.descripcion && (
                    <p className="whitespace-pre-line break-words">
                      {evento.descripcion}
                    </p>
                  )}
                  {evento.fecha_evento &&
                    evento.fecha_evento !== evento.fecha && (
                      <p>Fecha del hecho: {fecha(evento.fecha_evento)}</p>
                    )}
                  <dl className="space-y-2 text-muted-foreground">
                    <div>
                      <dt className="font-medium">Referencia técnica</dt>
                      <dd className="mt-1 break-all font-mono text-xs">
                        {evento.referencia ?? "Sin referencia individual"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Resultado: </dt>
                      <dd className="inline">
                        {pagina.opciones.resultados[evento.resultado] ??
                          "Registrado"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
      <nav aria-label="Páginas del historial" className="flex flex-wrap gap-3">
        {anteriores && (
          <Link href={ruta} className={claseBotonSecundario}>
            Volver a los más recientes
          </Link>
        )}
        {pagina.siguiente && (
          <Link
            href={`${ruta}${ruta.includes("?") ? "&" : "?"}antes=${encodeURIComponent(pagina.siguiente)}`}
            className={claseBotonPrimario}
          >
            Ver registros anteriores
          </Link>
        )}
      </nav>
    </div>
  );
}
