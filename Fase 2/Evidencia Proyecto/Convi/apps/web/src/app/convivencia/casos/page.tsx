import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, claseEnlace } from "@/app/components/formulario";
import { obtenerFormatoFecha } from "@/app/profesor/datos";
import { FiltrosListaCasos, type FiltrosCasos } from "./filtros";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { formatearDia, NOMBRE_ESTADO_CASO, obtenerCasos } from "./datos";

export const metadata: Metadata = { title: "Casos" };

export default async function PaginaCasos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const consulta = await searchParams;
  const campos = [
    "nombre",
    "rut",
    "responsable",
    "anio",
    "fecha",
    "estado",
  ] as const;
  const filtros = Object.fromEntries(
    campos.map((c) => [c, typeof consulta[c] === "string" ? consulta[c] : ""]),
  ) as FiltrosCasos;
  const parametros = new URLSearchParams();
  campos.forEach((c) => {
    if (filtros[c]) parametros.set(c, filtros[c]);
  });
  if (typeof consulta.pagina === "string")
    parametros.set("pagina", consulta.pagina);
  const [respuesta, formatearFecha] = await Promise.all([
    obtenerCasos(parametros),
    obtenerFormatoFecha(),
  ]);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const { casos, limite, total, pagina, opciones } = respuesta.datos;
  const paginas = Math.max(1, Math.ceil(total / limite));
  const enlace = (numero: number) => {
    const p = new URLSearchParams(parametros);
    p.set("pagina", String(numero));
    return `/convivencia/casos?${p.toString()}`;
  };

  return (
    <>
      <Encabezado
        titulo="Casos"
        descripcion="Un caso reúne situaciones de convivencia y las acciones para abordarlas, aquí puedes consultar sus antecedentes y seguimiento"
      />
      <FiltrosListaCasos
        key={campos.map((c) => filtros[c]).join("|")}
        inicial={filtros}
        opciones={opciones}
        estados={Object.entries(NOMBRE_ESTADO_CASO)}
      />
      <p className="mb-3 text-sm text-muted-foreground">
        Del movimiento más reciente al más antiguo, hasta {limite} casos por
        página
      </p>
      {casos.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-tarjeta">
          {Object.values(filtros).some(Boolean)
            ? "No hay casos que coincidan con estos filtros, prueba con otros datos o limpia los filtros"
            : "Todavía no hay casos, para abrir uno revisa una situación en la bandeja"}
        </p>
      ) : (
        <ul className="space-y-3">
          {casos.map((caso) => (
            <li key={caso.id}>
              <Link
                href={`/convivencia/casos/${caso.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted-foreground">
                    {caso.codigo}
                  </p>
                  <p className="mt-1 font-semibold">
                    {caso.titulo}
                    {caso.nombres_estudiantes.length > 0 && (
                      <span className="font-normal">
                        {" "}
                        — {caso.nombres_estudiantes.join(", ")}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[
                      caso.categoria,
                      `Responsable: ${caso.responsable}`,
                      `Inicio ${formatearDia(caso.fecha_inicio)}`,
                      caso.fecha_limite_cierre
                        ? `Cierre sugerido ${formatearDia(caso.fecha_limite_cierre)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Última actividad:{" "}
                    <time dateTime={caso.ultima_actividad}>
                      {formatearFecha(caso.ultima_actividad)}
                    </time>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {caso.estudiantes === 1
                      ? "1 estudiante"
                      : `${caso.estudiantes} estudiantes`}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {caso.situaciones === 1
                      ? "1 situación"
                      : `${caso.situaciones} situaciones`}
                  </span>
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                    {NOMBRE_ESTADO_CASO[caso.estado_actual] ??
                      caso.estado_actual}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div
        className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <p>
          {total === 0
            ? "0 casos"
            : `${(pagina - 1) * limite + 1}–${Math.min(pagina * limite, total)} de ${total} casos`}
        </p>
        {paginas > 1 && (
          <nav
            aria-label="Páginas de casos"
            className="flex flex-wrap items-center gap-4"
          >
            {pagina > 1 && (
              <Link
                href={enlace(pagina - 1)}
                prefetch={false}
                scroll={false}
                className={claseEnlace}
              >
                Anterior
              </Link>
            )}
            <span>
              Página {pagina} de {paginas}
            </span>
            {pagina < paginas && (
              <Link
                href={enlace(pagina + 1)}
                prefetch={false}
                scroll={false}
                className={claseEnlace}
              >
                Siguiente
              </Link>
            )}
          </nav>
        )}
      </div>
    </>
  );
}
