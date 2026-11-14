import type { Metadata } from "next";
import { EnlaceConCarga as Link, FormularioBusqueda } from "@/app/components/actividad";
import { claseFiltroProfesor } from "../busqueda";
import { claseBotonPrimario, claseBotonSecundario, Encabezado } from "@/app/components/formulario";
import { AvisoSinPermiso } from "../aviso-sin-permiso";
import {
  obtenerFormatoFecha,
  NOMBRE_ESTADO,
  obtenerSituaciones,
  URGENCIA,
} from "../datos";

export const metadata: Metadata = { title: "Mis registros" };

// HU-034 CA2: las situaciones que registró el profesor, la más reciente primero.
export default async function PaginaMisRegistros({ searchParams }: PageProps<"/profesor/situaciones">) {
  const filtros = await searchParams;
  const texto = (valor: string | string[] | undefined) => typeof valor === "string" ? valor.trim() : "";
  const curso = texto(filtros.curso);
  const fecha = texto(filtros.fecha);
  const categoria = texto(filtros.categoria);
  const estudiante = texto(filtros.estudiante);
  const pendientes = filtros.pendientes === "1";
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries({ curso, fecha, categoria, estudiante, pendientes: pendientes ? "1" : "" })) {
    if (valor) parametros.set(clave, valor);
  }
  const filtrado = parametros.size > 0;
  const paginaPedida = texto(filtros.pagina);
  if (paginaPedida) parametros.set("pagina", paginaPedida);
  const [respuesta, formatearFecha] = await Promise.all([
    obtenerSituaciones(parametros), obtenerFormatoFecha(),
  ]);
  if (!respuesta.ok) return <AvisoSinPermiso volverA="/profesor" />;
  const { registros: situaciones, pagina, haySiguiente, cursos, categorias } = respuesta.datos;

  function enlacePagina(numero: number) {
    const destino = new URLSearchParams(parametros);
    destino.set("pagina", String(numero));
    return `/profesor/situaciones?${destino}`;
  }

  return (
    <>
            <div className="flex flex-wrap items-start justify-between gap-x-4">
        <Encabezado
          titulo="Mis registros"
          descripcion="Las situaciones que registraste y en qué estado están. Abre una para ver su detalle y las aclaraciones que te pidió Convivencia."
        />
        {/* Una situación pertenece a un curso: primero se elige el curso. */}
        <Link href="/profesor" className={`mb-6 ${claseBotonPrimario}`}>
          Registrar situación
        </Link>
      </div>

      <FormularioBusqueda action="/profesor/situaciones" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-sm">Estudiante participante
          <input type="search" name="estudiante" defaultValue={estudiante} className={claseFiltroProfesor} />
        </label>
        <label className="text-sm">Curso
          <select name="curso" defaultValue={curso} className={claseFiltroProfesor}>
            <option value="">Todos</option>
            {cursos.map((valor) => <option key={valor}>{valor}</option>)}
          </select>
        </label>
        <label className="text-sm">Categoría
          <select name="categoria" defaultValue={categoria} className={claseFiltroProfesor}>
            <option value="">Todas</option>
            {categorias.map((valor) => <option key={valor}>{valor}</option>)}
          </select>
        </label>
        <label className="text-sm">Fecha de la situación
          <input type="date" name="fecha" defaultValue={fecha} className={claseFiltroProfesor} />
        </label>
        <label className="flex items-center gap-2 self-center text-sm">
          <input type="checkbox" name="pendientes" value="1" defaultChecked={pendientes} />
          Aclaraciones pendientes
        </label>
        <button className={claseBotonPrimario}>Buscar</button>
        <Link href="/profesor/situaciones" className="self-center text-sm text-primary">Limpiar</Link>
      </FormularioBusqueda>

      {situaciones.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {filtrado || pagina > 1 ? "No hay registros en esta página." : "Todavía no has registrado situaciones. Elige uno de tus cursos para registrar la primera."}
        </p>
      ) : (
        <ul className="space-y-3">
          {situaciones.map((situacion) => {
            const urgencia = URGENCIA[situacion.urgencia] ?? URGENCIA.NORMAL;
            const nombres = (rol: string) => situacion.estudiantes?.filter((e) => e.rol === rol).map((e) => e.nombre).join(", ");
            const involucrados = nombres("INVOLUCRADO");
            const afectados = nombres("AFECTADO");
            const testigos = nombres("TESTIGO");
            return (
              <li key={situacion.id}>
                <Link
                  href={`/profesor/situaciones/${situacion.id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-muted-foreground">
                      {situacion.codigo}
                    </p>
                    <p className="mt-1 font-semibold">
                      {situacion.categoria ?? "Sin categoría"}{involucrados && ` — ${involucrados}`}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[situacion.curso, `Ocurrió el ${formatearFecha(situacion.ocurrido_en)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {afectados && <p className="mt-1 text-sm text-muted-foreground">Afectados: {afectados}</p>}
                    {testigos && <p className="mt-1 text-sm text-muted-foreground">Testigos: {testigos}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    {situacion.aclaraciones_pendientes > 0 && (
                      <span className="rounded-full bg-naranjo px-2.5 py-0.5 text-xs font-semibold text-tinta">
                        {situacion.aclaraciones_pendientes === 1
                          ? "1 aclaración pendiente"
                          : `${situacion.aclaraciones_pendientes} aclaraciones pendientes`}
                      </span>
                    )}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencia.clase}`}>
                      {urgencia.texto}
                    </span>
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                      {NOMBRE_ESTADO[situacion.estado] ?? situacion.estado}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {(pagina > 1 || haySiguiente) && (
        <nav aria-label="Páginas de Mis registros" className="mt-6 flex flex-wrap items-center gap-3">
          {pagina > 1 && <Link className={claseBotonSecundario} href={enlacePagina(pagina - 1)}>Anterior</Link>}
          <span className="text-sm text-muted-foreground">Página {pagina}</span>
          {haySiguiente && <Link className={claseBotonSecundario} href={enlacePagina(pagina + 1)}>Siguiente</Link>}
        </nav>
      )}
    </>
  );
}