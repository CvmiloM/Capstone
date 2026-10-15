import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { obtenerContextoAdmin } from "../../datos";
import { obtenerNiveles } from "../../niveles/datos";
import { BotonTerminar } from "../boton-terminar";
import { type Asignacion, obtenerCurso, obtenerProfesores } from "../datos";
import { FormularioAsignacion } from "../formulario-asignacion";
import { FormularioCurso } from "../formulario-curso";
import { ANIOS_EDITABLES, NOMBRE_ROL } from "../opciones";

export const metadata: Metadata = { title: "Curso" };

const SITUACION: Record<
  Asignacion["situacion"],
  { texto: string; clase: string }
> = {
  VIGENTE: { texto: "Vigente", clase: "bg-accent text-accent-foreground" },
  PROGRAMADA: { texto: "Programada", clase: "bg-muted text-foreground" },
  TERMINADA: { texto: "Terminada", clase: "bg-muted text-muted-foreground" },
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
  return fecha ? formatoFecha.format(new Date(`${fecha}T00:00:00Z`)) : "—";
}

// PB-015 (HU-013): un curso con sus datos y sus profesores. En un año cerrado
// todo queda de solo lectura (decisión del PO).
export default async function PaginaCurso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [curso, niveles, profesores, { escuela }] = await Promise.all([
    obtenerCurso(id),
    obtenerNiveles(),
    obtenerProfesores(),
    obtenerContextoAdmin(),
  ]);

  if (!curso) {
    return (
      <>
        <Link href="/admin/cursos" className={`text-sm ${claseEnlace}`}>
          ← Cursos
        </Link>
        <p className="mt-4 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No encontramos ese curso en tu escuela.
        </p>
      </>
    );
  }

  const editable = ANIOS_EDITABLES.includes(curso.anio_estado);
  // Fecha de hoy en la zona horaria de la escuela, para los valores por defecto.
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: escuela.zonaHoraria,
  }).format(new Date());
  // Se ofrecen los niveles activos y, si ya no está activo, el nivel actual.
  const opcionesNivel = niveles.filter(
    (nivel) => nivel.activo || nivel.id === curso.nivel_id,
  );

  return (
    <>
      <Link
        href={`/admin/cursos?anio=${curso.anio_academico_id}`}
        className={`text-sm ${claseEnlace}`}
      >
        ← Cursos de {curso.anio}
      </Link>

      <div className="mt-4">
        <Encabezado
          titulo={curso.nombre}
          descripcion={
            <>
              {`${curso.codigo}${curso.seccion ? ` · Sección ${curso.seccion}` : ""} · ${curso.nivel_nombre} · Año ${curso.anio} · `}
              {/* PB-017: la nómina filtrada por este curso. */}
              <Link
                href={`/admin/estudiantes?curso=${curso.id}`}
                className={claseEnlace}
              >
                {curso.estudiantes}{" "}
                {curso.estudiantes === 1 ? "estudiante" : "estudiantes"}
              </Link>
            </>
          }
        />
      </div>

      {!editable && (
        <p
          role="note"
          className="mb-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        >
          El año {curso.anio} está cerrado: este curso y sus profesores son de
          solo lectura.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section aria-labelledby="titulo-profesores">
            <h2 id="titulo-profesores" className="mb-3 text-lg font-semibold">
              Profesores
            </h2>
            {curso.asignaciones.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Todavía no hay profesores asignados a este curso.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-tarjeta">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Profesores asignados a {curso.nombre}
                  </caption>
                  <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Profesor
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Rol
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Desde
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Hasta
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        <span className="sr-only">Terminar</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {curso.asignaciones.map((asignacion) => {
                      const nombre = `${asignacion.nombres} ${asignacion.apellidos}`;
                      const situacion = SITUACION[asignacion.situacion];
                      return (
                        <tr key={asignacion.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{nombre}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{asignacion.correo}</span>
                              {asignacion.estado_cuenta === "PENDIENTE" && (
                                <span>· Invitación pendiente</span>
                              )}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p>{NOMBRE_ROL[asignacion.rol]}</p>
                            <span
                              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${situacion.clase}`}
                            >
                              {situacion.texto}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatearFecha(asignacion.fecha_inicio)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatearFecha(asignacion.fecha_fin)}
                          </td>
                          <td className="px-4 py-3">
                            {editable &&
                              asignacion.situacion !== "TERMINADA" && (
                                <BotonTerminar
                                  asignacionId={asignacion.id}
                                  profesor={nombre}
                                  desde={asignacion.fecha_inicio}
                                  hasta={asignacion.fecha_fin}
                                  hoy={hoy}
                                />
                              )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {editable && (
            <section
              aria-labelledby="titulo-asignar"
              className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
            >
              <h2 id="titulo-asignar" className="mb-4 text-lg font-semibold">
                Asignar profesor
              </h2>
              {profesores.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tu escuela todavía no tiene profesores.{" "}
                  <Link href="/admin/usuarios" className={claseEnlace}>
                    Invitar profesores
                  </Link>
                </p>
              ) : (
                <FormularioAsignacion
                  cursoId={curso.id}
                  profesores={profesores}
                  hoy={hoy}
                />
              )}
            </section>
          )}
        </div>

        <section
          aria-labelledby="titulo-datos"
          className="h-fit rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
        >
          <h2 id="titulo-datos" className="mb-4 text-lg font-semibold">
            Datos del curso
          </h2>
          {editable ? (
            <FormularioCurso curso={curso} niveles={opcionesNivel} />
          ) : (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Código</dt>
                <dd className="font-mono">{curso.codigo}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Nivel</dt>
                <dd>{curso.nivel_nombre}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>
    </>
  );
}