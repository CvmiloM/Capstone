import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { NOMBRE_ESTADO } from "../anios/datos";
import { obtenerVistaCursos } from "./datos";
import { FormularioCurso } from "./formulario-curso";
import { ANIOS_EDITABLES } from "./opciones";

export const metadata: Metadata = { title: "Cursos" };

// PB-015 (HU-013): cursos de un año de la escuela. Por defecto muestra el año
// Activo (o el más reciente); ?anio=<id> elige otro.
export default async function PaginaCursos({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const { anio: anioPedido } = await searchParams;
  const { anios, niveles, anio, cursos } = await obtenerVistaCursos(anioPedido);

  if (!anio) {
    return (
      <>
        <Encabezado titulo="Cursos" />
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Los cursos pertenecen a un año académico, y tu escuela todavía no
          tiene ninguno.{" "}
          <Link href="/admin/anios" className={claseEnlace}>
            Crear un año académico
          </Link>
        </p>
      </>
    );
  }

  const editable = ANIOS_EDITABLES.includes(anio.estado);
  const nivelesActivos = niveles.filter((nivel) => nivel.activo);

  return (
    <>
      <Encabezado
        titulo="Cursos"
        descripcion="Los cursos de cada año, con su nivel y sus profesores. Abre un curso para asignarle profesores."
      />

      <nav aria-label="Años académicos" className="mb-6 flex flex-wrap gap-2">
        {anios.map((a) => {
          const elegido = a.id === anio.id;
          return (
            <Link
              key={a.id}
              href={`/admin/cursos?anio=${a.id}`}
              aria-current={elegido ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                elegido
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              {a.anio}{" "}
              <span className={elegido ? "" : "text-muted-foreground"}>
                · {NOMBRE_ESTADO[a.estado]}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-6 xl:grid-cols-3">
        <section aria-labelledby="titulo-cursos" className="xl:col-span-2">
          <h2 id="titulo-cursos" className="sr-only">
            Cursos de {anio.anio}
          </h2>
          {cursos.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {anio.anio} todavía no tiene cursos.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-tarjeta">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Cursos de {anio.anio}</caption>
                <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Curso
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Nivel
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Profesor jefe
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Profesores
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Estudiantes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cursos.map((curso) => (
                    <tr key={curso.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/cursos/${curso.id}`}
                          className={`font-medium ${claseEnlace}`}
                        >
                          {curso.nombre}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <span className="font-mono">{curso.codigo}</span>
                          {curso.seccion && ` · Sección ${curso.seccion}`}
                        </p>
                      </td>
                      <td className="px-4 py-3">{curso.nivel_nombre}</td>
                      <td className="px-4 py-3">
                        {curso.profesor_jefe ?? (
                          <span className="text-muted-foreground">
                            Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {curso.profesores}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {curso.estudiantes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="titulo-nuevo"
          className="h-fit rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
        >
          <h2 id="titulo-nuevo" className="mb-4 text-lg font-semibold">
            Nuevo curso en {anio.anio}
          </h2>
          {!editable ? (
            <p className="text-sm text-muted-foreground">
              El año {anio.anio} está cerrado: sus cursos son de solo lectura.
            </p>
          ) : nivelesActivos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Para crear cursos necesitas al menos un nivel activo.{" "}
              <Link href="/admin/niveles" className={claseEnlace}>
                Ir a niveles educativos
              </Link>
            </p>
          ) : (
            <FormularioCurso anioId={anio.id} niveles={nivelesActivos} />
          )}
        </section>
      </div>
    </>
  );
}
