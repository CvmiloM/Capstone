import type { Metadata } from "next";
import { EnlaceConCarga as Link, FormularioBusqueda } from "@/app/components/actividad";
import { claseFiltroProfesor, coincideBusqueda } from "./busqueda";
import { claseBotonPrimario, claseBotonSecundario, Encabezado } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";
import { AvisoSinPermiso } from "./aviso-sin-permiso";
import { NOMBRE_ROL, obtenerCursos } from "./datos";

export const metadata: Metadata = { title: "Mis cursos" };

// HU-034 CA1: los cursos donde el profesor tiene una asignación vigente.
export default async function PaginaMisCursos({ searchParams }: PageProps<"/profesor">) {
  const [respuesta, filtros] = await Promise.all([obtenerCursos(), searchParams]);
  if (!respuesta.ok) return <AvisoSinPermiso volverA="/" />;
  const q = typeof filtros.q === "string" ? filtros.q : "";
  const anio = typeof filtros.anio === "string" ? filtros.anio : "";
  const estado = filtros.estado === "todos" || filtros.estado === "historicos" ? filtros.estado : "activos";
  const anios = [...new Set(respuesta.datos.map((curso) => curso.anio))];
  const cursos = respuesta.datos.filter((curso) =>
    (estado === "todos" || curso.activo === (estado === "activos")) &&
    (!anio || String(curso.anio) === anio) &&
    (!q || coincideBusqueda(curso.nombre, q)),
  );

  return (
    <>
      <Encabezado
        titulo="Mis cursos"
        descripcion="Consulta tus cursos y abre los activos para ver a sus estudiantes."
      />

      <FormularioBusqueda action="/profesor" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-sm">Curso
          <input type="search" name="q" defaultValue={q} placeholder="Por ejemplo, III medio C" className={claseFiltroProfesor} />
        </label>
        <label className="text-sm">Año académico
          <select name="anio" defaultValue={anio} className={claseFiltroProfesor}>
            <option value="">Todos</option>
            {anios.map((valor) => <option key={valor}>{valor}</option>)}
          </select>
        </label>
        <label className="text-sm">Estado
          <select name="estado" defaultValue={estado} className={claseFiltroProfesor}>
            <option value="activos">Activos</option>
            <option value="historicos">Históricos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <button className={claseBotonPrimario}>Buscar</button>
        <Link href="/profesor" className={claseBotonSecundario}>Limpiar</Link>
      </FormularioBusqueda>

      {cursos.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No hay cursos con estos filtros.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cursos.map((curso) => {
            const contenido = (<>

                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {curso.nivel} · {curso.anio} · {curso.activo ? "Activo" : "Histórico"}
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
                {curso.activo && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Icono nombre="estudiantes" className="size-4 text-primary" />
                  {curso.estudiantes}{" "}
                  {curso.estudiantes === 1 ? "estudiante" : "estudiantes"}
                </p>}
            </>);
            const tarjeta = "block h-full rounded-2xl border border-border bg-card p-5 shadow-tarjeta";
            return <li key={curso.id}>{curso.activo ? (
              <Link href={`/profesor/cursos/${curso.id}`} className={`${tarjeta} hover:border-primary/40`}>{contenido}</Link>
            ) : <div className={tarjeta}>{contenido}</div>}</li>;
          })}
        </ul>
      )}
    </>
  );
}