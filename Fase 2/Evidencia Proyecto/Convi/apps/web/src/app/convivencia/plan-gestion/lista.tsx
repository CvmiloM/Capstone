import {
  EnlaceConCarga as Link,
  FormularioBusqueda,
} from "@/app/components/actividad";
import {
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { ESTADOS, RAIZ, rutaDetalle, type Lista, type Tipo } from "./opciones";

export function BusquedaGestion({
  ruta,
  parametros,
  anio = false,
}: {
  ruta: string;
  parametros: Record<string, string>;
  anio?: boolean;
}) {
  const { q = "", anio: year = "" } = parametros;
  const resto = Object.fromEntries(
    Object.entries(parametros).filter(
      ([k]) => !["q", "anio", "pagina"].includes(k),
    ),
  );
  return (
    <FormularioBusqueda
      action={ruta}
      className="mb-5 flex flex-wrap items-end gap-3"
    >
      {Object.entries(resto).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="min-w-48 flex-1">
        <label htmlFor="buscar-plan" className="block text-sm font-medium">
          Buscar por contenido
        </label>
        <input
          id="buscar-plan"
          name="q"
          type="search"
          maxLength={120}
          defaultValue={q}
          className="mt-1.5 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        />
      </div>
      {anio && (
        <div>
          <label htmlFor="anio-plan" className="block text-sm font-medium">
            Año académico
          </label>
          <input
            id="anio-plan"
            name="anio"
            type="number"
            min={2000}
            max={2200}
            defaultValue={year}
            placeholder="Todos"
            className="mt-1.5 min-h-11 w-36 rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          />
        </div>
      )}
      <button className={claseBotonPrimario}>Buscar</button>
      <Link
        href={`${ruta}${Object.keys(resto).length ? "?" + new URLSearchParams(resto) : ""}`}
        className={claseBotonSecundario}
      >
        Limpiar
      </Link>
    </FormularioBusqueda>
  );
}
export function PaginacionGestion({
  total,
  pagina,
  ruta,
  parametros,
}: {
  total: number;
  pagina: number;
  ruta: string;
  parametros: Record<string, string>;
}) {
  const paginas = Math.max(1, Math.ceil(total / 20));
  const enlace = (n: number) =>
    `${ruta}?${new URLSearchParams({ ...parametros, pagina: String(n) })}`;
  return (
    <nav
      aria-label="Páginas de resultados"
      className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <span className="text-muted-foreground">
        {total} {total === 1 ? "resultado" : "resultados"}, página {pagina} de{" "}
        {paginas}
      </span>
      <div className="flex gap-3">
        {pagina > 1 && (
          <Link href={enlace(pagina - 1)} className={claseBotonSecundario}>
            Anterior
          </Link>
        )}
        {pagina < paginas && (
          <Link href={enlace(pagina + 1)} className={claseBotonSecundario}>
            Siguiente
          </Link>
        )}
      </div>
    </nav>
  );
}
export function ListaGestion({
  lista,
  tipo,
  ruta = RAIZ,
  parametros = {},
}: {
  lista: Lista;
  tipo: Tipo;
  ruta?: string;
  parametros?: Record<string, string>;
}) {
  return (
    <>
      {lista.filas.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-semibold">
            {lista.total
              ? "Esta página no tiene resultados"
              : "No hay resultados para esta búsqueda"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {tipo === "planes"
              ? "Puedes crear un Plan o buscar en otro año."
              : "Prueba otra búsqueda o añade el primer registro desde su sección de origen."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card px-5">
          {lista.filas.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-start justify-between gap-3 py-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={rutaDetalle(tipo, f.id)}
                  className="break-words text-base font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {f.orden ? `${f.orden}. ` : ""}
                  {f.titulo}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[String(f.anio), f.objetivo, f.accion]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
                {f.descripcion && (
                  <p className="mt-2 line-clamp-2 break-words text-sm">
                    {f.descripcion}
                  </p>
                )}
                {(f.inicio_programado || f.responsable) && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {[
                      f.inicio_programado
                        ? `Programada para ${f.inicio_programado}`
                        : null,
                      f.responsable ? `Responsable ${f.responsable}` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>
              {f.estado !== "OBJETIVO" && (
                <span
                  className={`rounded-full px-3 py-1 text-sm ${f.estado === "CANCELADO" ? "bg-destructive/10 text-destructive" : f.estado === "COMPLETADO" ? "bg-verde/10 text-verde" : f.estado === "ACTIVO" || f.estado === "EN_PROGRESO" ? "bg-accent text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  {ESTADOS[f.estado] ?? f.estado}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <PaginacionGestion
        total={lista.total}
        pagina={lista.pagina}
        ruta={ruta}
        parametros={parametros}
      />
    </>
  );
}
