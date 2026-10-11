import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";
import { AvisoSinPermiso } from "./aviso-sin-permiso";
import { NOMBRE_ROL, obtenerCursos } from "./datos";

export const metadata: Metadata = { title: "Mis cursos" };

// HU-034 CA1: los cursos donde el profesor tiene una asignación vigente.
export default async function PaginaMisCursos() {
  const respuesta = await obtenerCursos();
  if (!respuesta.ok) return <AvisoSinPermiso volverA="/" />;
  const cursos = respuesta.datos;

  return (
    <>
      <Encabezado
        titulo="Mis cursos"
        descripcion="Los cursos donde tienes una asignación vigente. Elige uno para ver a sus estudiantes."
      />

      {cursos.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No tienes cursos asignados en este momento. Si crees que es un
          error, avisa al administrador de tu establecimiento.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cursos.map((curso) => (
            <li key={curso.id}>
              <Link
                href={`/profesor/cursos/${curso.id}`}
                className="block h-full rounded-2xl border border-border bg-card p-5 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {curso.nivel} · {curso.anio}
                </p>
                <p className="mt-1 text-lg font-semibold">{curso.nombre}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {curso.roles.map((rol) => (
                    <span
                      key={rol}
                      className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
                    >
                      {NOMBRE_ROL[rol] ?? rol}
                    </span>
                  ))}
                </div>
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Icono nombre="estudiantes" className="size-4 text-primary" />
                  {curso.estudiantes}{" "}
                  {curso.estudiantes === 1 ? "estudiante" : "estudiantes"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}