import type { Metadata } from "next";
import Link from "next/link";
import {
  claseBotonSecundario,
  Encabezado,
} from "@/app/components/formulario";
import { BotonEstado } from "./boton-estado";
import { type EstadoAnio, NOMBRE_ESTADO, obtenerAnios } from "./datos";
import { FormularioAnio } from "./formulario-anio";

export const metadata: Metadata = { title: "Años académicos" };

const CLASE_ESTADO: Record<EstadoAnio, string> = {
  PLANIFICADO: "bg-accent text-accent-foreground",
  ACTIVO: "bg-primary text-primary-foreground",
  CERRADO: "bg-muted text-muted-foreground",
};

// Las fechas llegan como AAAA-MM-DD: se muestran en UTC para que la zona
// horaria del servidor no cambie el día.
const formatoFecha = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatearFecha(fecha: string | null) {
  return fecha ? formatoFecha.format(new Date(`${fecha}T00:00:00Z`)) : "sin fecha";
}

// PB-013 (HU-011): años académicos de la escuela. Los cursos y las matrículas
// se organizan por año, y solo uno puede estar Activo a la vez.
export default async function PaginaAnios() {
  const anios = await obtenerAnios();
  const activo = anios.find((anio) => anio.estado === "ACTIVO");

  return (
    <>
      <Encabezado
        titulo="Años académicos"
        descripcion="Los períodos con que se organizan los cursos y las matrículas. Un año nuevo queda Planificado hasta que lo actives, y solo puede haber un año Activo a la vez."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="titulo-anios" className="lg:col-span-2">
          <h2 id="titulo-anios" className="sr-only">
            Años registrados
          </h2>
          {anios.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Todavía no hay años académicos. Crea el primero con el
              formulario.
            </p>
          ) : (
            <ul className="space-y-3">
              {anios.map((anio) => (
                <li
                  key={anio.id}
                  className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
                >
                  <div>
                    <div className="flex items-center gap-2.5">
                      <p className="text-xl font-semibold">{anio.anio}</p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASE_ESTADO[anio.estado]}`}
                      >
                        {NOMBRE_ESTADO[anio.estado]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatearFecha(anio.fecha_inicio)} al{" "}
                      {formatearFecha(anio.fecha_fin)} · {anio.cursos}{" "}
                      {anio.cursos === 1 ? "curso" : "cursos"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-start gap-2">
                    {anio.estado !== "CERRADO" && (
                      <Link
                        href={`/admin/anios/${anio.id}`}
                        className={claseBotonSecundario}
                      >
                        Editar
                      </Link>
                    )}
                    {anio.estado === "ACTIVO" && (
                      <BotonEstado id={anio.id} anio={anio.anio} destino="CERRADO" />
                    )}
                    {anio.estado === "PLANIFICADO" &&
                      (activo ? (
                        <p className="max-w-48 text-xs text-muted-foreground">
                          Para activarlo, primero cierra el año {activo.anio}.
                        </p>
                      ) : (
                        <BotonEstado id={anio.id} anio={anio.anio} destino="ACTIVO" />
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="titulo-nuevo"
          className="h-fit rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
        >
          <h2 id="titulo-nuevo" className="mb-4 text-lg font-semibold">
            Nuevo año académico
          </h2>
          <FormularioAnio />
        </section>
      </div>
    </>
  );
}