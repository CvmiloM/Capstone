import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import {
  Encabezado,
  claseEnlace,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { ListaEvidencias } from "@/app/components/evidencias/lista-evidencias";
import { FormularioEvidencia } from "@/app/components/evidencias/formulario-evidencia";
import { pedir } from "../../../datos";
import { AvisoNoDisponible } from "../../../aviso-no-disponible";
import { FormularioGestion, PanelFormulario } from "../../formulario";
import { BusquedaGestion, ListaGestion, PaginacionGestion } from "../../lista";
import {
  ESTADOS,
  NOMBRES,
  RAIZ,
  TIPOS,
  rutaDetalle,
  type Detalle,
  type Lista,
  type Tipo,
} from "../../opciones";

export const metadata = { title: "Plan de Gestión de Convivencia" };
const panel = "rounded-2xl border border-border bg-card p-5 sm:p-6";
function fecha(v: string | null | undefined) {
  if (!v) return null;
  const [d, h] = v.split("T");
  return `${d.split("-").reverse().join("-")}${h ? " " + h.slice(0, 5) : ""}`;
}
function Estado({ estado }: { estado: string }) {
  const color =
    estado === "COMPLETADO"
      ? "bg-verde/10 text-verde"
      : ["ARCHIVADO", "CANCELADO"].includes(estado)
        ? "bg-muted text-muted-foreground"
        : "bg-accent text-accent-foreground";
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-3 py-1 text-sm font-medium ${color}`}
    >
      {ESTADOS[estado] ?? estado}
    </span>
  );
}
function Seccion({
  titulo,
  children,
  id,
}: {
  titulo: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={`${panel} scroll-mt-24`}>
      <h2 className="mb-4 font-serif text-2xl font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}
function Dato({
  nombre,
  valor,
  campo,
  tipo,
  d,
}: {
  nombre: string;
  valor: string | number | null | undefined;
  campo?: string;
  tipo: Tipo;
  d: Detalle;
}) {
  return (
    <div className="relative min-w-0">
      <dt className="pr-12 text-sm text-muted-foreground">{nombre}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words pr-12 text-sm font-medium">
        {valor === null || valor === undefined || valor === ""
          ? "Sin registrar"
          : valor}
      </dd>
      {campo && d.editable && (
        <dd className="[&>details>summary]:absolute [&>details>summary]:right-0 [&>details>summary]:top-0 [&>details>summary]:-mt-3">
          <PanelFormulario
            key={`${d.version}-${campo}`}
            compacto
            titulo={`Editar ${nombre.toLowerCase()}`}
          >
            <FormularioGestion
              contexto={{ tipo, id: d.registro.id, operacion: "editar" }}
              detalle={d}
              campoEditable={campo}
            />
          </PanelFormulario>
        </dd>
      )}
    </div>
  );
}

export default async function DetallePlan({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tipo: nombreTipo, id } = await params;
  const p = await searchParams;
  if (
    !TIPOS.includes(nombreTipo as Tipo) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  const tipo = nombreTipo as Tipo,
    ruta = rutaDetalle(tipo, id);
  const consulta = new URLSearchParams();
  for (const k of ["pagina", "q", "pagina_actividades"])
    if (typeof p[k] === "string") consulta.set(k, p[k]);
  const respuesta = await pedir<Detalle>(
    `/convivencia/gestion/${tipo}/${id}?${consulta}`,
  );
  if (!respuesta.ok) return <AvisoNoDisponible volverA={RAIZ} />;
  const d = respuesta.datos,
    r = d.registro;
  const titulo = r.nombre ?? r.titulo ?? NOMBRES[tipo];
  const pagina =
    typeof p.pagina === "string" && /^\d+$/.test(p.pagina)
      ? Number(p.pagina)
      : 1;
  const q = typeof p.q === "string" ? p.q : "";
  const puedeAgregar =
    d.editable && !["COMPLETADO", "CANCELADO"].includes(r.estado ?? "");
  const dato = (
    nombre: string,
    valor: string | number | null | undefined,
    campo?: string,
  ) => <Dato nombre={nombre} valor={valor} campo={campo} tipo={tipo} d={d} />;
  let accionesObjetivo: Lista | undefined;
  if (tipo === "objetivos") {
    const l = await pedir<Lista>(
      `/convivencia/gestion?${new URLSearchParams({ tipo: "acciones", plan_id: d.plan_id, objetivo_id: id, pagina: String(pagina), q })}`,
    );
    if (!l.ok)
      return <AvisoNoDisponible volverA={rutaDetalle("planes", d.plan_id)} />;
    accionesObjetivo = l.datos;
  }
  const agregar = (padre: Tipo, padreId: string, etiqueta: string) => (
    <PanelFormulario
      key={`${padreId}-${d.version}`}
      titulo={etiqueta}
      inicialAbierto={p.nuevo === "1" && padreId === id}
    >
      <FormularioGestion
        contexto={{ tipo: padre, id: padreId, operacion: "agregar" }}
        ordenInicial={d.siguiente_orden}
      />
    </PanelFormulario>
  );
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <nav
        aria-label="Ubicación en el Plan"
        className="flex flex-wrap gap-x-2 gap-y-1 text-sm"
      >
        <Link href={RAIZ} className={claseEnlace}>
          Planes de Convivencia
        </Link>
        {tipo !== "planes" && (
          <>
            <span aria-hidden="true">/</span>
            <Link
              href={rutaDetalle("planes", d.plan_id)}
              className={claseEnlace}
            >
              {d.plan_nombre}
            </Link>
          </>
        )}
        {d.objetivo_id && (
          <>
            <span aria-hidden="true">/</span>
            <Link
              href={rutaDetalle("objetivos", d.objetivo_id)}
              className={claseEnlace}
            >
              {d.objetivo_titulo}
            </Link>
          </>
        )}
        {d.accion_id && (
          <>
            <span aria-hidden="true">/</span>
            <Link
              href={rutaDetalle("acciones", d.accion_id)}
              className={claseEnlace}
            >
              {d.accion_titulo}
            </Link>
          </>
        )}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="relative min-w-0 flex-1">
          <div className={d.editable && tipo !== "planes" ? "pr-12" : undefined}>
            <Encabezado
              titulo={titulo}
              descripcion={`${NOMBRES[tipo]} de Convivencia del año ${d.anio}`}
            />
          </div>
          {d.editable && tipo !== "planes" && (
            <div className="[&>details>summary]:absolute [&>details>summary]:right-0 [&>details>summary]:top-0">
              <PanelFormulario
                compacto
                key={`${d.version}-titulo`}
                titulo="Editar nombre"
              >
                <FormularioGestion
                  contexto={{ tipo, id, operacion: "editar" }}
                  detalle={d}
                  campoEditable="titulo"
                />
              </PanelFormulario>
            </div>
          )}
        </div>
        {r.estado && <Estado estado={r.estado} />}
      </div>
      {p.guardado === "1" && (
        <p
          role="status"
          className="rounded-xl bg-verde/10 px-4 py-3 text-sm text-verde"
        >
          Los cambios se guardaron.
        </p>
      )}
      {!d.editable && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm">
          El Plan está{" "}
          {d.plan_estado === "ARCHIVADO" ? "archivado" : "completado"}, sus
          antecedentes se conservan sin nuevos cambios.
        </p>
      )}
      <Seccion
        titulo={
          tipo === "planes"
            ? "Resumen del Plan"
            : tipo === "objetivos"
              ? "Qué se quiere lograr"
              : tipo === "acciones"
                ? "Resumen de la acción"
                : "Resumen de la actividad"
        }
      >
        {tipo === "planes" ? (
          <>
            <p className="mb-5 max-w-3xl text-sm leading-relaxed">
              Este Plan organiza las acciones para mejorar la convivencia de la
              escuela durante el año, comienza definiendo los objetivos y
              después añade lo que se hará para alcanzarlos.
            </p>
            <dl className="grid gap-5 sm:grid-cols-3">
              {dato("Año académico", d.anio)}
              {dato(
                "Aprobación",
                r.aprobado_en
                  ? `${r.aprobado_por_nombre}, ${r.aprobado_fecha}`
                  : "Pendiente de aprobación",
              )}
              <div>
                <dt className="text-sm text-muted-foreground">
                  Estado del Plan
                </dt>
                <dd className="mt-2">
                  <Estado estado={r.estado!} />
                </dd>
                {r.estado !== "ARCHIVADO" && (
                  <dd>
                    <PanelFormulario
                      compacto
                      key={d.version}
                      titulo="Editar estado"
                    >
                      <FormularioGestion
                        contexto={{ tipo, id, operacion: "estado" }}
                        detalle={d}
                      />
                    </PanelFormulario>
                  </dd>
                )}
              </div>
            </dl>
            {d.editable && r.estado === "BORRADOR" && (
              <PanelFormulario
                compacto
                key={`${d.version}-nombre`}
                titulo="Editar nombre o año del Plan"
              >
                <FormularioGestion
                  contexto={{ tipo, id, operacion: "editar" }}
                  detalle={d}
                />
              </PanelFormulario>
            )}
          </>
        ) : (
          <>
            <dl className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {dato(
                tipo === "objetivos" ? "Descripción" : "Qué se realizará",
                r.descripcion,
                "descripcion",
              )}
              {tipo === "objetivos" ? (
                dato("Orden dentro del Plan", r.orden)
              ) : (
                <>
                  {dato(
                    "Responsable principal",
                    r.responsable,
                    "persona_responsable_id",
                  )}
                  {tipo === "acciones" ? (
                    <>
                      {dato(
                        "Dirigida a",
                        r.publico_objetivo,
                        "publico_objetivo",
                      )}
                      {dato(
                        "Indicador",
                        r.nombre_indicador,
                        "nombre_indicador",
                      )}
                      {dato(
                        "Meta esperada",
                        r.meta_indicador,
                        "meta_indicador",
                      )}
                      {dato("Unidad", r.unidad_indicador, "unidad_indicador")}
                      {dato(
                        "Evidencia esperada",
                        r.evidencia_esperada,
                        "evidencia_esperada",
                      )}
                    </>
                  ) : (
                    <>
                      {dato(
                        "Inicio programado",
                        fecha(r.inicio_programado),
                        "inicio_programado",
                      )}
                      {dato(
                        "Término programado",
                        fecha(r.fin_programado),
                        "fin_programado",
                      )}
                      {dato("Lugar", r.lugar, "lugar")}
                    </>
                  )}
                </>
              )}
            </dl>
            {tipo === "actividades" && d.editable && (
              <PanelFormulario
                key={`${d.version}-reprogramar`}
                titulo="Reprogramar actividad"
              >
                <FormularioGestion
                  contexto={{ tipo, id, operacion: "editar" }}
                  detalle={d}
                />
              </PanelFormulario>
            )}
          </>
        )}
      </Seccion>

      {tipo === "planes" && d.arbol && (
        <Seccion titulo="Objetivos del Plan" id="objetivos">
          <p className="mb-5 text-sm text-muted-foreground">
            Selecciona un objetivo para revisar sus acciones, las actividades se
            consultan desde cada acción.
          </p>
          <BusquedaGestion ruta={ruta} parametros={{ q }} />
          <div className="space-y-4">
            {d.arbol.filas.map((o) => (
              <details
                key={o.id}
                open={!!q}
                className="group/objetivo overflow-hidden rounded-xl border border-border"
              >
                <summary className="flex min-h-16 cursor-pointer flex-wrap items-center gap-3 bg-accent/50 p-4 focus-visible:outline-2 focus-visible:outline-ring">
                  <span
                    aria-hidden="true"
                    className="text-primary transition-transform group-open/objetivo:rotate-90"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="size-4"
                    >
                      <path d="m9 5 7 7-7 7" />
                    </svg>
                  </span>
                  <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-primary">
                    {String(o.orden).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-semibold">
                      {o.titulo}
                    </span>
                    {o.descripcion && (
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {o.descripcion}
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {o.acciones_total} acciones
                  </span>
                </summary>
                <div className="px-4 pb-4 sm:px-6">
                  {o.acciones.length ? (
                    <ul className="divide-y divide-border">
                      {o.acciones.map((a) => (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-5"
                        >
                          <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                            <Link
                              href={rutaDetalle("acciones", a.id)}
                              className="font-medium text-primary hover:underline"
                            >
                              {a.titulo}
                            </Link>
                            {a.descripcion && (
                              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                {a.descripcion}
                              </p>
                            )}
                            <p className="mt-2 text-sm text-muted-foreground">
                              Responsable {a.responsable ?? "sin asignar"}
                            </p>
                          </div>
                          <Estado estado={a.estado} />
                          <Link
                            href={rutaDetalle("acciones", a.id)}
                            className={claseBotonSecundario}
                          >
                            Ver actividades ({a.actividades_total})
                            <span className="sr-only"> de {a.titulo}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-5 text-sm text-muted-foreground">
                      No hay acciones que coincidan, puedes añadir la primera o
                      cambiar la búsqueda.
                    </p>
                  )}
                  {o.acciones_total > o.acciones.length && (
                    <Link
                      href={rutaDetalle("objetivos", o.id)}
                      className={`text-sm ${claseEnlace}`}
                    >
                      Ver todas las acciones del objetivo ({o.acciones_total})
                    </Link>
                  )}
                  <div className="flex flex-wrap items-start justify-between gap-4 border-t border-border pt-3">
                    <Link
                      href={rutaDetalle("objetivos", o.id)}
                      className={`py-3 text-sm ${claseEnlace}`}
                    >
                      Ver o corregir objetivo
                    </Link>
                    {d.editable && agregar("objetivos", o.id, "Añadir acción")}
                  </div>
                </div>
              </details>
            ))}
          </div>
          {!d.arbol.filas.length && (
            <p className="py-6 text-sm text-muted-foreground">
              No hay objetivos con esta búsqueda, puedes limpiar el filtro o
              añadir un objetivo.
            </p>
          )}
          <PaginacionGestion
            total={d.arbol.total}
            pagina={d.arbol.pagina}
            ruta={ruta}
            parametros={{ q }}
          />
          {d.editable && agregar("planes", id, "Añadir objetivo")}
        </Seccion>
      )}

      {accionesObjetivo && (
        <Seccion titulo="Acciones del objetivo">
          <BusquedaGestion ruta={ruta} parametros={{ q }} />
          <ListaGestion
            lista={accionesObjetivo}
            tipo="acciones"
            ruta={ruta}
            parametros={{ q }}
          />
          {d.editable && agregar("objetivos", id, "Añadir acción")}
        </Seccion>
      )}

      {tipo === "acciones" && d.actividades && (
        <Seccion titulo="Actividades de la acción" id="actividades">
          <p className="mb-4 text-sm text-muted-foreground">
            Las actividades tienen fecha, responsables y resultados, también
            aparecen en el calendario de Convivencia.
          </p>
          {d.actividades.filas.length ? (
            <ul className="divide-y divide-border">
              {d.actividades.filas.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                    <Link
                      href={rutaDetalle("actividades", a.id)}
                      className="font-medium text-primary hover:underline"
                    >
                      {a.titulo}
                    </Link>
                    {a.descripcion && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {a.descripcion}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {a.inicio_programado
                        ? `Programada para ${a.inicio_programado}`
                        : "Sin programación"}{" "}
                      · {a.responsable ?? "Sin responsable"}
                    </p>
                  </div>
                  <Estado estado={a.estado} />
                  <Link
                    href={rutaDetalle("actividades", a.id)}
                    className={claseBotonSecundario}
                  >
                    Ver detalle<span className="sr-only"> de {a.titulo}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-5 text-sm text-muted-foreground">
              Todavía no hay actividades en esta página, puedes añadir una para
              concretar la acción.
            </p>
          )}
          <PaginacionGestion
            ruta={ruta}
            total={d.actividades.total}
            pagina={d.actividades.pagina}
            parametros={{}}
            parametroPagina="pagina_actividades"
          />
          {puedeAgregar && agregar("acciones", id, "Añadir actividad")}
        </Seccion>
      )}

      {tipo === "actividades" && (
        <Seccion titulo="Participantes" id="participantes">
          <p className="mb-5 text-sm text-muted-foreground">
            El responsable principal coordina la actividad, aquí se indican los
            cursos y profesionales que colaboran.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold">Cursos</h3>
              {d.vinculados?.cursos.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {d.vinculados.cursos.map((c) => (
                    <li key={c.id}>{c.nombre}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No hay cursos asociados.
                </p>
              )}
              {d.editable && (
                <PanelFormulario
                  key={`${d.version}-cursos`}
                  titulo="Asociar curso"
                >
                  <FormularioGestion
                    contexto={{ tipo, id, operacion: "cursos" }}
                  />
                </PanelFormulario>
              )}
            </div>
            <div>
              <h3 className="font-semibold">Profesionales</h3>
              {d.vinculados?.profesionales.length ? (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {d.vinculados.profesionales.map((m) => (
                    <li key={m.id} className="py-2">
                      <p className="font-medium">{m.nombre}</p>
                      <p className="text-muted-foreground">{m.funcion}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No hay profesionales asignados.
                </p>
              )}
              {d.editable && (
                <PanelFormulario
                  key={`${d.version}-profesionales`}
                  titulo="Asignar profesional"
                >
                  <FormularioGestion
                    contexto={{ tipo, id, operacion: "profesionales" }}
                  />
                </PanelFormulario>
              )}
            </div>
          </div>
        </Seccion>
      )}

      {(tipo === "acciones" || tipo === "actividades") && (
        <Seccion titulo="Resultados y evidencias" id="resultados">
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dato("Resultado", r.resumen_resultado)}
            {dato("Fecha de término registrada", fecha(r.completado_en))}
            {tipo === "actividades" ? (
              <>
                {dato("Inicio real", fecha(r.inicio_real))}
                {dato("Término real", fecha(r.fin_real))}
              </>
            ) : (
              <>
                {dato("Indicador", r.nombre_indicador)}
                {dato("Meta esperada", r.meta_indicador)}
                {dato("Valor alcanzado", r.valor_indicador)}
                {dato("Unidad", r.unidad_indicador)}
              </>
            )}
          </dl>
          {tipo === "acciones" &&
            r.meta_indicador != null &&
            r.valor_indicador == null && (
              <p className="mt-4 text-sm text-muted-foreground">
                Todavía no se ha registrado un valor alcanzado para esta meta.
              </p>
            )}
          {d.editable && r.estado !== "CANCELADO" && (
            <PanelFormulario
              key={`${d.version}-resultado`}
              titulo={
                r.estado === "COMPLETADO"
                  ? "Corregir resultado"
                  : "Registrar avance o resultado"
              }
            >
              <FormularioGestion
                contexto={{ tipo, id, operacion: "estado" }}
                detalle={d}
              />
            </PanelFormulario>
          )}
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="mb-4 font-semibold">Evidencias</h3>
            <ListaEvidencias
              evidencias={d.evidencias.filas}
              rutaDescarga="/convivencia/evidencias"
              vacio="Todavía no hay evidencias, puedes adjuntar documentos o imágenes que respalden lo realizado."
            />
            <PaginacionGestion
              ruta={ruta}
              total={d.evidencias.total}
              pagina={pagina}
              parametros={
                typeof p.pagina_actividades === "string"
                  ? { pagina_actividades: p.pagina_actividades }
                  : {}
              }
            />
            {d.editable && (
              <PanelFormulario titulo="Adjuntar evidencia">
                <FormularioEvidencia
                  destino={
                    tipo === "acciones"
                      ? "convivencia-accion-gestion"
                      : "convivencia-actividad-gestion"
                  }
                  registroId={id}
                />
              </PanelFormulario>
            )}
          </div>
        </Seccion>
      )}
    </div>
  );
}
