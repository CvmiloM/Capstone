import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { AvisoSinPermiso } from "../../aviso-sin-permiso";
import { NOMBRE_ROL, obtenerCursos, obtenerEstudiantes } from "../../datos";

export const metadata: Metadata = { title: "Estudiantes del curso" };

// HU-034 CA1: estudiantes matriculados en un curso del profesor. La API
// rechaza el curso si su asignación no está vigente.
export default async function PaginaCurso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [cursos, estudiantes] = await Promise.all([
    obtenerCursos(),
    obtenerEstudiantes(id),
  ]);
  const curso = cursos.ok ? cursos.datos.find((c) => c.id === id) : undefined;
  if (!curso || !estudiantes.ok) return <AvisoSinPermiso volverA="/profesor" />;

  return (
    <>
      <Link href="/profesor" className={`text-sm ${claseEnlace}`}>
        ← Mis cursos
      </Link>
      <div className="mt-4">
        <Encabezado
          titulo={curso.nombre}
          descripcion={`${curso.nivel} · ${curso.anio} · ${curso.roles
            .map((rol) => NOMBRE_ROL[rol] ?? rol)
            .join(" y ")}`}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-tarjeta">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Estudiantes matriculados</caption>
          <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Estudiante
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Código
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {estudiantes.datos.map((estudiante) => (
              <tr key={estudiante.id}>
                <td className="px-4 py-3 font-medium">
                  {estudiante.apellidos}, {estudiante.nombres}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {estudiante.codigo_estudiante}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {estudiantes.datos.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Este curso todavía no tiene estudiantes matriculados.
          </p>
        )}
      </div>
    </>
  );
}