import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado } from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { formatearDia, NOMBRE_ESTADO_CASO, obtenerCasos } from "./datos";

export const metadata: Metadata = { title: "Casos" };

// PB-053 (HU-046): casos de la escuela, primero los que siguen abiertos. Un
// caso se abre desde el detalle de una situación En revisión.
export default async function PaginaCasos() {
  const respuesta = await obtenerCasos();
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const { casos, limite } = respuesta.datos;

  return (
    <>
      <Encabezado
        titulo="Casos"
        descripcion="Los casos de la escuela, primero los que siguen abiertos, un caso se abre desde una situación En revisión de la bandeja."
      />
      {casos.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-tarjeta">
          Todavía no hay casos, para abrir uno, revisa una situación en la
          bandeja.
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
      {casos.length >= limite && (
        <p className="mt-4 text-sm text-muted-foreground">
          Se muestran los {limite} casos más recientes.
        </p>
      )}
    </>
  );
}
