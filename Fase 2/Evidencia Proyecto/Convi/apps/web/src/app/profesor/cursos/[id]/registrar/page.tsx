import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { AvisoSinPermiso } from "../../../aviso-sin-permiso";
import {
  obtenerCategorias,
  obtenerCursos,
  obtenerEstudiantes,
} from "../../../datos";
import { FormularioSituacion } from "./formulario-situacion";

export const metadata: Metadata = { title: "Registrar situación" };

// PB-042 (HU-035): registro de una situación en uno de los cursos del profesor.
// La API vuelve a comprobar la asignación vigente al recibir el formulario (CA1).
export default async function PaginaRegistrarSituacion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [cursos, estudiantes, categorias] = await Promise.all([
    obtenerCursos(),
    obtenerEstudiantes(id),
    obtenerCategorias(),
  ]);
  const curso = cursos.ok ? cursos.datos.find((c) => c.id === id) : undefined;
  if (!curso || !estudiantes.ok || !categorias.ok) {
    return <AvisoSinPermiso volverA="/profesor" />;
  }

  return (
    <>
      <Link href={`/profesor/cursos/${curso.id}`} className={`text-sm ${claseEnlace}`}>
        ← {curso.nombre}
      </Link>
      <div className="mt-4">
        <Encabezado
          titulo="Registrar situación"
          descripcion={`${curso.nombre} · ${curso.nivel} · ${curso.anio}. Convivencia la recibirá como Nueva, con su código.`}
        />
      </div>

      {estudiantes.datos.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Este curso todavía no tiene estudiantes matriculados, así que no se
          puede registrar una situación en él.
        </p>
      ) : (
        <FormularioSituacion
          cursoId={curso.id}
          estudiantes={estudiantes.datos}
          categorias={categorias.datos}
        />
      )}
    </>
  );
}