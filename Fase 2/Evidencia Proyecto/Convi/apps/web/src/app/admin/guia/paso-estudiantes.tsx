import Link from "next/link";
import { claseEnlace } from "@/app/components/formulario";
import { FormularioCarga } from "../importaciones/formulario-carga";
import { NOMBRE_ESTADO } from "../importaciones/opciones";
import { BotonTerminarPaso } from "./boton-paso";
import type { Guia } from "./datos";

// PB-036 (HU-029): la nómina se carga desde la guía con la misma importación
// del portal, ya marcada como Estudiantes. Ahí se relacionan las columnas, se
// revisa la vista previa (CA1) y se confirman solo las filas válidas (CA3).
// CA2: la columna Curso usa los cursos ya creados, por su nombre o su código.
export function PasoEstudiantes({
  guia,
  fecha,
  listo,
}: {
  guia: Guia;
  fecha: (iso: string) => string;
  listo: boolean;
}) {
  const anio = guia.academico.anios.find(
    (a) => a.estado === "ACTIVO" || a.estado === "PLANIFICADO",
  );
  const cursos = anio
    ? guia.academico.cursos.filter((c) => c.anio === anio.anio)
    : [];
  const { importaciones, confirmados } = guia.estudiantes;

  return (
    <div className="space-y-6">
      <section aria-labelledby="titulo-cursos-nomina">
        <h3 id="titulo-cursos-nomina" className="text-base font-semibold">
          {anio ? `Cursos de ${anio.anio}` : "Cursos"}
        </h3>
        {cursos.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Todavía no hay cursos en un año planificado o activo. Puedes cargar
            estudiantes sin curso, o crear los cursos en el paso{" "}
            <Link href="/admin/guia?paso=cursos" className={claseEnlace}>
              Año, niveles y cursos
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              En la columna Curso de la nómina escribe el nombre del curso,
              como «{cursos[0].nombre}», o su código. No hay que importar los
              cursos de nuevo.
            </p>
            <ul className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {cursos.map((curso) => (
                <li key={curso.codigo}>
                  {curso.nombre}{" "}
                  <span className="text-muted-foreground">({curso.codigo})</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {anio && !anio.fecha_inicio && (
          <p
            role="note"
            className="mt-3 rounded-lg border border-amarillo/60 bg-amarillo/15 px-3 py-2.5 text-sm"
          >
            El año {anio.anio} no tiene fecha de inicio, y es la que se usa
            como fecha de matrícula si la nómina no la trae. Agrega a la nómina
            la columna Fecha de matrícula o completa el año en{" "}
            <Link href="/admin/anios" className={claseEnlace}>
              Años académicos
            </Link>
            .
          </p>
        )}
      </section>

      <section
        aria-labelledby="titulo-nomina"
        className="border-t border-border pt-5"
      >
        <h3 id="titulo-nomina" className="text-base font-semibold">
          Cargar la nómina
        </h3>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Un CSV o XLSX con una fila por estudiante. Obligatorias: Código
          estudiante, Nombres y Apellidos. Opcionales: RUT, fecha de nacimiento,
          correo, teléfono, dirección, curso y fecha de matrícula.{" "}
          <a
            href="/admin/importaciones/plantillas/estudiantes"
            download
            className={claseEnlace}
          >
            Descargar la plantilla
          </a>
          . Al cargarla se abre la importación: relacionas las columnas, revisas
          la vista previa y confirmas solo las filas válidas. Después vuelve a la
          guía.
        </p>
        <FormularioCarga tipo="ESTUDIANTES" />
      </section>

      {importaciones.length > 0 && (
        <section
          aria-labelledby="titulo-importaciones-guia"
          className="border-t border-border pt-5"
        >
          <h3 id="titulo-importaciones-guia" className="text-base font-semibold">
            Importaciones de estudiantes
          </h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {importaciones.map((importacion) => (
              <li
                key={importacion.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <span className="font-medium break-all">
                    {importacion.archivo_nombre}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {NOMBRE_ESTADO[importacion.estado] ?? importacion.estado} ·{" "}
                    {importacion.confirmadas.toLocaleString("es-CL")} de{" "}
                    {importacion.filas.toLocaleString("es-CL")} filas
                    confirmadas · {fecha(importacion.creado_en)}
                  </span>
                </span>
                <Link
                  href={`/admin/importaciones/${importacion.id}`}
                  className={claseEnlace}
                >
                  {["CARGADO", "REVISION", "FALLIDO"].includes(
                    importacion.estado,
                  )
                    ? "Retomar"
                    : "Ver"}
                  <span className="sr-only"> {importacion.archivo_nombre}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t border-border pt-5">
        <p className="mb-3 text-sm text-muted-foreground">
          {confirmados === 0
            ? "Todavía no hay estudiantes confirmados en una importación."
            : `Hay ${confirmados.toLocaleString("es-CL")} ${confirmados === 1 ? "estudiante confirmado" : "estudiantes confirmados"} por importación.`}
        </p>
        {!listo && (
          <BotonTerminarPaso
            paso="estudiantes"
            version={guia.version}
            habilitado={confirmados > 0}
          />
        )}
      </section>
    </div>
  );
}
