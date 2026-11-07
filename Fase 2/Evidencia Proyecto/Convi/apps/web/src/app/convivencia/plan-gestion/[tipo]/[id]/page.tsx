import { notFound } from "next/navigation";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Encabezado, claseEnlace } from "@/app/components/formulario";
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
function Dato({
  nombre,
  valor,
}: {
  nombre: string;
  valor: string | number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{nombre}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">
        {valor === null || valor === undefined || valor === ""
          ? "Sin registrar"
          : valor}
      </dd>
    </div>
  );
}
function fecha(valor: string | null | undefined) {
  if (!valor) return null;
  const [d, h] = valor.split("T");
  return `${d.split("-").reverse().join("-")}${h ? " " + h.slice(0, 5) : ""}`;
}

export default async function DetallePlan({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tipo: nombreTipo, id } = await params,
    p = await searchParams;
  if (!TIPOS.includes(nombreTipo as Tipo) || !/^[0-9a-f-]{36}$/i.test(id))
    notFound();
  const tipo = nombreTipo as Tipo,
    ruta = rutaDetalle(tipo, id);
  const secciones =
    tipo === "planes"
      ? [
          ["resumen", "Resumen"],
          ["objetivos", "Objetivos"],
          ["acciones", "Acciones"],
          ["actividades", "Actividades"],
        ]
      : tipo === "objetivos"
        ? [
            ["datos", "Objetivo"],
            ["acciones", "Acciones"],
          ]
        : tipo === "acciones"
          ? [
              ["datos", "Datos de la acción"],
              ["actividades", "Actividades"],
              ["resultados", "Resultados y evidencias"],
            ]
          : [
              ["datos", "Datos de la actividad"],
              ["participantes", "Participantes"],
              ["resultados", "Resultado y evidencias"],
            ];
  const seccion =
    typeof p.seccion === "string" && secciones.some((s) => s[0] === p.seccion)
      ? p.seccion
      : secciones[0][0];
  const pagina = typeof p.pagina === "string" ? p.pagina : "1";
  const respuesta = await pedir<Detalle>(
    `/convivencia/gestion/${tipo}/${id}?pagina=${encodeURIComponent(seccion === "resultados" ? pagina : "1")}`,
  );
  if (!respuesta.ok) return <AvisoNoDisponible volverA={RAIZ} />;
  const d = respuesta.datos,
    r = d.registro,
    titulo = r.nombre ?? r.titulo ?? NOMBRES[tipo];
  const parametros: Record<string, string> = { seccion };
  if (typeof p.q === "string") parametros.q = p.q;
  const listado =
    seccion === "objetivos" ||
    seccion === "acciones" ||
    seccion === "actividades";
  let lista: Lista | undefined;
  if (listado) {
    const q = new URLSearchParams({
      tipo: seccion,
      plan_id: d.plan_id,
      pagina,
      q: parametros.q ?? "",
    });
    if (tipo === "objetivos") q.set("objetivo_id", id);
    if (tipo === "acciones") q.set("accion_id", id);
    const respuestaLista = await pedir<Lista>(`/convivencia/gestion?${q}`);
    if (!respuestaLista.ok) return <AvisoNoDisponible volverA={RAIZ} />;
    lista = respuestaLista.datos;
  }
  const puedeAgregar =
    d.editable &&
    ((tipo === "planes" && seccion === "objetivos") ||
      (tipo === "objetivos" && seccion === "acciones") ||
      (tipo === "acciones" &&
        seccion === "actividades" &&
        !["COMPLETADO", "CANCELADO"].includes(r.estado ?? "")));
  const valor = (nombre: string, v: string | number | null | undefined) => (
    <Dato nombre={nombre} valor={v} />
  );
  return (
    <div className="mx-auto max-w-6xl">
      <nav
        aria-label="Ubicación en el Plan"
        className="mb-5 flex flex-wrap gap-x-2 gap-y-1 text-sm"
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Encabezado
          titulo={titulo}
          descripcion={`${NOMBRES[tipo]} de Convivencia del año ${d.anio}`}
        />
        {r.estado && (
          <span
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${r.estado === "CANCELADO" ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}
          >
            {ESTADOS[r.estado] ?? r.estado}
          </span>
        )}
      </div>
      {p.guardado === "1" && (
        <p
          role="status"
          className="mb-5 rounded-lg bg-verde/10 px-4 py-3 text-sm text-verde"
        >
          Los cambios se guardaron.
        </p>
      )}
      {!d.editable && (
        <p className="mb-5 rounded-lg bg-muted px-4 py-3 text-sm">
          El Plan está{" "}
          {d.plan_estado === "ARCHIVADO" ? "archivado" : "completado"}, puedes
          consultar sus antecedentes, pero ya no modificarlos.
        </p>
      )}
      <nav
        aria-label="Secciones del registro"
        className="mb-6 flex gap-1 overflow-x-auto border-b border-border pb-3"
      >
        {secciones.map(([v, n]) => (
          <Link
            key={v}
            href={`${ruta}?seccion=${v}`}
            aria-current={seccion === v ? "page" : undefined}
            className={`min-h-11 shrink-0 rounded-xl px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${seccion === v ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {n}
          </Link>
        ))}
      </nav>
      {lista ? (
        <section aria-label={secciones.find((s) => s[0] === seccion)?.[1]}>
          <h2 className="text-xl font-semibold">
            {secciones.find((s) => s[0] === seccion)?.[1]}
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            {seccion === "objetivos"
              ? "Los objetivos describen qué se quiere mejorar, abre uno para preparar sus acciones."
              : seccion === "acciones"
                ? "Las acciones indican qué se hará para alcanzar un objetivo, abre una para programar sus actividades."
                : "Las actividades tienen fecha, responsables y resultados, también aparecen en el calendario de Convivencia."}
          </p>
          <BusquedaGestion ruta={ruta} parametros={parametros} />
          <ListaGestion
            lista={lista}
            tipo={seccion as Tipo}
            ruta={ruta}
            parametros={parametros}
          />
          {puedeAgregar && (
            <PanelFormulario
              titulo={`Añadir ${seccion === "objetivos" ? "objetivo" : seccion === "acciones" ? "acción" : "actividad"}`}
            >
              <FormularioGestion
                key={d.version}
                contexto={{ tipo, id, operacion: "agregar" }}
                ordenInicial={d.siguiente_orden}
              />
            </PanelFormulario>
          )}
        </section>
      ) : seccion === "participantes" ? (
        <section className="space-y-6">
          <h2 className="text-xl font-semibold">
            Cursos y profesionales participantes
          </h2>
          <p className="text-sm text-muted-foreground">
            El responsable principal coordina la actividad, aquí puedes añadir
            los cursos y las personas que colaboran.
          </p>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-lg font-semibold">Cursos</h3>
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
                <PanelFormulario titulo="Asociar curso">
                  <FormularioGestion
                    key={d.version}
                    contexto={{ tipo, id, operacion: "cursos" }}
                  />
                </PanelFormulario>
              )}
            </section>
            <section className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-lg font-semibold">Profesionales</h3>
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
                <PanelFormulario titulo="Asignar profesional">
                  <FormularioGestion
                    key={d.version}
                    contexto={{ tipo, id, operacion: "profesionales" }}
                  />
                </PanelFormulario>
              )}
            </section>
          </div>
        </section>
      ) : seccion === "resultados" ? (
        <div className="space-y-7">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-xl font-semibold">Resultado registrado</h2>
            <dl className="grid gap-5 sm:grid-cols-2">
              {valor("Resultado", r.resumen_resultado)}
              {valor("Cumplimiento", fecha(r.completado_en))}
              {tipo === "actividades" ? (
                <>
                  {valor("Inicio real", fecha(r.inicio_real))}
                  {valor("Término real", fecha(r.fin_real))}
                </>
              ) : (
                <>
                  {valor("Indicador", r.nombre_indicador)}
                  {valor("Unidad", r.unidad_indicador)}
                  {valor("Meta esperada", r.meta_indicador)}
                  {valor("Valor alcanzado", r.valor_indicador)}
                </>
              )}
            </dl>
            {tipo === "acciones" &&
              r.meta_indicador != null &&
              r.valor_indicador == null && (
                <p className="mt-4 text-sm text-muted-foreground">
                  La meta sigue pendiente de evaluación, todavía no se ha
                  registrado un valor alcanzado.
                </p>
              )}
            {d.editable && r.estado !== "CANCELADO" && (
              <PanelFormulario
                titulo={
                  r.estado === "COMPLETADO"
                    ? "Corregir resultado"
                    : "Registrar avance o resultado"
                }
              >
                <FormularioGestion
                  key={d.version}
                  contexto={{ tipo, id, operacion: "estado" }}
                  detalle={d}
                />
              </PanelFormulario>
            )}
          </section>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-xl font-semibold">Evidencias</h2>
            <ListaEvidencias
              evidencias={d.evidencias.filas}
              rutaDescarga="/convivencia/evidencias"
              vacio="Todavía no hay evidencias, puedes adjuntar documentos o imágenes que respalden lo realizado."
            />
            <PaginacionGestion
              ruta={ruta}
              total={d.evidencias.total}
              pagina={Number(pagina) || 1}
              parametros={{ seccion: "resultados" }}
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
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <h2 className="mb-5 text-xl font-semibold">
              {tipo === "planes"
                ? "Datos del Plan"
                : tipo === "objetivos"
                  ? "Qué se quiere lograr"
                  : "Planificación"}
            </h2>
            {tipo === "planes" ? (
              <>
                <p className="mb-5 max-w-3xl text-sm leading-relaxed">
                  Este Plan organiza las acciones para mejorar la convivencia de
                  la escuela durante el año, comienza definiendo los objetivos y
                  después añade lo que se hará para alcanzarlos.
                </p>
                <dl className="grid gap-5 sm:grid-cols-2">
                  {valor("Año académico", d.anio)}
                  {valor(
                    "Aprobación",
                    r.aprobado_en
                      ? `${r.aprobado_por_nombre}, ${r.aprobado_fecha}`
                      : "Pendiente de aprobación",
                  )}
                </dl>
              </>
            ) : (
              <dl className="grid gap-5 sm:grid-cols-2">
                {valor(
                  tipo === "objetivos" ? "Descripción" : "Qué se realizará",
                  r.descripcion,
                )}
                {tipo === "objetivos" ? (
                  valor("Orden", r.orden)
                ) : (
                  <>
                    {valor("Responsable principal", r.responsable)}
                    {tipo === "acciones" ? (
                      <>
                        {valor("Dirigida a", r.publico_objetivo)}
                        {valor("Evidencia esperada", r.evidencia_esperada)}
                        {valor("Indicador", r.nombre_indicador)}
                        {valor("Meta esperada", r.meta_indicador)}
                        {valor("Unidad", r.unidad_indicador)}
                      </>
                    ) : (
                      <>
                        {valor("Inicio programado", fecha(r.inicio_programado))}
                        {valor("Término programado", fecha(r.fin_programado))}
                        {valor("Lugar", r.lugar)}
                      </>
                    )}
                  </>
                )}
              </dl>
            )}
            {d.editable && (tipo !== "planes" || r.estado === "BORRADOR") && (
              <PanelFormulario
                titulo={
                  tipo === "actividades"
                    ? "Corregir o reprogramar actividad"
                    : "Corregir datos"
                }
              >
                <FormularioGestion
                  key={d.version}
                  contexto={{ tipo, id, operacion: "editar" }}
                  detalle={d}
                />
              </PanelFormulario>
            )}
          </section>
          {tipo === "planes" && r.estado !== "ARCHIVADO" && (
            <PanelFormulario
              titulo={
                r.estado === "BORRADOR"
                  ? "Aprobar o archivar Plan"
                  : "Cambiar estado del Plan"
              }
            >
              <FormularioGestion
                key={d.version}
                contexto={{ tipo, id, operacion: "estado" }}
                detalle={d}
              />
            </PanelFormulario>
          )}
          {tipo === "objetivos" && (
            <Link href={`${ruta}?seccion=acciones`} className={claseEnlace}>
              Ver las acciones de este objetivo
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
