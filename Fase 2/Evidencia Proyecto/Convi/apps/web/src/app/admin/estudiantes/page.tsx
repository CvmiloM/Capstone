import { DesactivacionEstudiantes } from "./desactivacion";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import {
  claseBotonSecundario,
  claseEnlace,
  Encabezado,
} from "@/app/components/formulario";
import { obtenerAnios } from "../anios/datos";
import { obtenerCurso, obtenerCursos } from "../cursos/datos";
import { obtenerContextoAdmin } from "../datos";
import { obtenerNomina } from "./datos";
import { FormularioEstudiante } from "./formulario-estudiante";
import { FILTRO_ESTADO_NOMINA, NOMBRE_ESTADO_ESTUDIANTE } from "./opciones";

export const metadata: Metadata = { title: "Estudiantes" };

const claseControl =
  "mt-1.5 block w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/15";

function leer(valor: string | undefined) {
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-017 (HU-014): nómina de estudiantes de la escuela, con búsqueda por
// nombre, código o RUT y filtro por curso (?buscar=, ?curso=, ?pagina=).
// PB-031 (HU-024 CA2): por defecto solo los Activos; ?estado= muestra otros.
export default async function PaginaEstudiantes({
  searchParams,
}: {
  searchParams: Promise<{
    buscar?: string;
    curso?: string;
    pagina?: string;
    estado?: string;
    desactivacion?: string;
  }>;
}) {
  const parametros = await searchParams;
  const buscar = leer(parametros.buscar);
  const curso = leer(parametros.curso);
  const pagina = Math.max(1, Number.parseInt(leer(parametros.pagina), 10) || 1);
  const estado = FILTRO_ESTADO_NOMINA.some(
    ([valor]) => valor !== "" && valor === leer(parametros.estado),
  )
    ? leer(parametros.estado)
    : "";

  const [nomina, anios, { escuela }, cursoElegido] = await Promise.all([
    obtenerNomina({ buscar, curso, pagina, estado }),
    obtenerAnios(),
    obtenerContextoAdmin(),
    curso ? obtenerCurso(curso) : null,
  ]);
  // El filtro ofrece los cursos del año del curso elegido o, si no hay, los
  // del año Activo (o el más reciente).
  const anioFiltro =
    anios.find((a) => a.id === cursoElegido?.anio_academico_id) ??
    anios.find((a) => a.estado === "ACTIVO") ??
    anios[0];
  const cursos = anioFiltro ? await obtenerCursos(anioFiltro.id) : [];
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: escuela.zonaHoraria,
  }).format(new Date());

  const totalPaginas = Math.max(1, Math.ceil(nomina.total / nomina.por_pagina));
  const filtrando = buscar !== "" || curso !== "" || estado !== "";
  const desde = (nomina.pagina - 1) * nomina.por_pagina + 1;
  const hasta = desde + nomina.estudiantes.length - 1;

  function enlacePagina(numero: number) {
    const consulta = new URLSearchParams();
    if (buscar) consulta.set("buscar", buscar);
    if (curso) consulta.set("curso", curso);
    if (estado) consulta.set("estado", estado);
    if (numero > 1) consulta.set("pagina", String(numero));
    const texto = consulta.toString();
    return texto ? `/admin/estudiantes?${texto}` : "/admin/estudiantes";
  }

  return (
    <>
      <Encabezado
        titulo="Estudiantes"
        descripcion="La nómina de la escuela con su curso actual. Abre una ficha para corregirla o matricular al estudiante."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <section aria-labelledby="titulo-nomina" className="xl:col-span-2">
          <h2 id="titulo-nomina" className="sr-only">
            Nómina
          </h2>

          <Form
            action="/admin/estudiantes"
            role="search"
            className="mb-4 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-tarjeta sm:grid-cols-[1fr_12rem_9rem_auto] sm:items-end"
          >
            <div>
              <label htmlFor="buscar" className="block text-sm font-medium">
                Buscar
              </label>
              <input
                id="buscar"
                name="buscar"
                type="search"
                defaultValue={buscar}
                maxLength={100}
                placeholder="Nombre, código o RUT"
                className={claseControl}
              />
            </div>
            <div>
              <label htmlFor="curso" className="block text-sm font-medium">
                Curso{anioFiltro ? ` (${anioFiltro.anio})` : ""}
              </label>
              <select
                id="curso"
                name="curso"
                defaultValue={curso}
                className={claseControl}
              >
                <option value="">Todos</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="estado" className="block text-sm font-medium">
                Estado
              </label>
              <select
                id="estado"
                name="estado"
                defaultValue={estado}
                className={claseControl}
              >
                {FILTRO_ESTADO_NOMINA.map(([valor, nombre]) => (
                  <option key={valor} value={valor}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className={claseBotonSecundario}>
                Buscar
              </button>
              {filtrando && (
                <Link
                  href="/admin/estudiantes"
                  className={`self-center text-sm ${claseEnlace}`}
                >
                  Limpiar
                </Link>
              )}
            </div>
          </Form>

          {parametros.desactivacion === "realizada" && (
            <p
              role="status"
              className="mb-4 rounded-xl bg-primary/5 p-4 text-sm"
            >
              Estudiantes desactivados, sus fichas y antecedentes se conservan
            </p>
          )}
          {(!estado || estado === "ACTIVO") && (
            <DesactivacionEstudiantes
              buscar={buscar}
              curso={curso}
              total={nomina.total}
              hoy={hoy}
            />
          )}
          {nomina.estudiantes.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {filtrando
                ? "No encontramos estudiantes con esa búsqueda."
                : "No hay estudiantes activos. Crea una ficha con el formulario o elige otro estado en el filtro."}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-tarjeta">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Estudiantes de la escuela
                  </caption>
                  <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Estudiante
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        RUT
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Curso
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {nomina.estudiantes.map((estudiante) => (
                      <tr key={estudiante.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/estudiantes/${estudiante.id}`}
                            className={`font-medium ${claseEnlace}`}
                          >
                            {estudiante.nombres} {estudiante.apellidos}
                          </Link>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {estudiante.codigo_estudiante}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                          {estudiante.rut ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {estudiante.curso_nombre ? (
                            <>
                              {estudiante.curso_nombre}
                              <span className="text-muted-foreground">
                                {" "}
                                · {estudiante.anio}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              Sin matrícula
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {NOMBRE_ESTADO_ESTUDIANTE[estudiante.estado] ??
                            estudiante.estado}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <nav
                aria-label="Páginas de la nómina"
                className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
              >
                <p>
                  {desde}–{hasta} de {nomina.total}{" "}
                  {nomina.total === 1 ? "estudiante" : "estudiantes"}
                </p>
                {totalPaginas > 1 && (
                  <div className="flex gap-2">
                    {nomina.pagina > 1 && (
                      <Link
                        href={enlacePagina(nomina.pagina - 1)}
                        className={claseBotonSecundario}
                      >
                        Anterior
                      </Link>
                    )}
                    {nomina.pagina < totalPaginas && (
                      <Link
                        href={enlacePagina(nomina.pagina + 1)}
                        className={claseBotonSecundario}
                      >
                        Siguiente
                      </Link>
                    )}
                  </div>
                )}
              </nav>
            </>
          )}
        </section>

        <section
          aria-labelledby="titulo-nuevo"
          className="h-fit rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
        >
          <h2 id="titulo-nuevo" className="mb-4 text-lg font-semibold">
            Nuevo estudiante
          </h2>
          <FormularioEstudiante hoy={hoy} />
        </section>
      </div>
    </>
  );
}
