"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Campo,
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { FormularioConCarga } from "@/app/components/actividad";
import { buscarOpciones, guardarGestion } from "./acciones";
import {
  ESTADOS,
  NOMBRES,
  type ContextoFormulario,
  type Detalle,
  type EstadoFormulario,
  type Opciones,
  type Registro,
  type Tipo,
} from "./opciones";

const CONTROL =
  "mt-1.5 block min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const ROJO =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive disabled:opacity-60";

export function PanelFormulario({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <details
      className="mt-5 rounded-xl border border-border bg-card p-4 sm:p-5"
      onToggle={(e) => setAbierto(e.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-primary focus-visible:outline-2 focus-visible:outline-ring">
        {titulo}
      </summary>
      {abierto && <div className="mt-5 max-w-3xl">{children}</div>}
    </details>
  );
}

export function SelectorGestion({
  clase,
  name,
  etiqueta,
  inicial = "",
  nombreInicial = "",
  actividadId,
  error,
  controlId,
}: {
  clase: string;
  name: string;
  etiqueta: string;
  inicial?: string;
  nombreInicial?: string;
  actividadId?: string;
  error?: string;
  controlId?: string;
}) {
  const generado = useId(),
    id = controlId ?? generado;
  const [q, setQ] = useState(""),
    [seleccion, setSeleccion] = useState(inicial),
    [opciones, setOpciones] = useState<Opciones>({
      total: 0,
      filas: inicial ? [{ id: inicial, nombre: nombreInicial }] : [],
    });
  const [pagina, setPagina] = useState(1),
    [cargando, setCargando] = useState(true),
    [fallo, setFallo] = useState("");
  const contador = useRef(0);
  const [nombreElegido, setNombreElegido] = useState(nombreInicial);
  async function cargar(buscar: string, pag: number) {
    const turno = ++contador.current;
    setCargando(true);
    setFallo("");
    try {
      const r = await buscarOpciones(
        clase,
        buscar,
        pag,
        seleccion,
        actividadId,
      );
      if (turno === contador.current) {
        setOpciones(r);
        setPagina(pag);
      }
    } catch {
      if (turno === contador.current)
        setFallo("No pudimos cargar las opciones, vuelve a buscar.");
    } finally {
      if (turno === contador.current) setCargando(false);
    }
  }
  useEffect(() => {
    let vigente = true;
    const turno = ++contador.current;
    buscarOpciones(clase, "", 1, inicial, actividadId)
      .then((r) => {
        if (vigente && turno === contador.current) setOpciones(r);
      })
      .catch(() => {
        if (vigente && turno === contador.current)
          setFallo("No pudimos cargar las opciones, vuelve a buscar.");
      })
      .finally(() => {
        if (vigente && turno === contador.current) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [clase, inicial, actividadId]);
  const filas =
    opciones.filas.some((o) => o.id === seleccion) || !seleccion
      ? opciones.filas
      : [{ id: seleccion, nombre: nombreElegido }, ...opciones.filas];
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {etiqueta}
      </label>
      {(clase !== "anios" || opciones.total > 25 || fallo) && (
        <div className="flex gap-2">
          <input
            aria-label={`Buscar ${etiqueta.toLowerCase()}`}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={`${CONTROL} mt-0 min-w-0`}
            placeholder="Buscar por nombre"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void cargar(q, 1);
              }
            }}
          />
          <button
            type="button"
            className={claseBotonSecundario}
            onClick={() => void cargar(q, 1)}
            disabled={cargando}
          >
            Buscar
          </button>
        </div>
      )}
      <select
        id={id}
        name={name}
        value={seleccion}
        onChange={(e) => {
          setSeleccion(e.target.value);
          setNombreElegido(
            filas.find((o) => o.id === e.target.value)?.nombre ?? "",
          );
        }}
        className={CONTROL}
        required
        aria-invalid={!!error}
        aria-describedby={error || fallo ? `${id}-error` : undefined}
        aria-busy={cargando}
      >
        <option value="">
          {cargando ? "Cargando opciones…" : "Selecciona una opción"}
        </option>
        {filas.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
      {(error || fallo) && (
        <p role="alert" id={`${id}-error`} className="text-sm text-destructive">
          {error || fallo}
        </p>
      )}
      <div
        className="flex items-center gap-3 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <span>
          {cargando
            ? "Cargando opciones…"
            : `${opciones.total} opciones encontradas`}
        </span>
        {pagina > 1 && (
          <button
            type="button"
            className="text-primary underline"
            disabled={cargando}
            onClick={() => void cargar(q, pagina - 1)}
          >
            Anteriores
          </button>
        )}
        {pagina * 25 < opciones.total && (
          <button
            type="button"
            className="text-primary underline"
            disabled={cargando}
            onClick={() => void cargar(q, pagina + 1)}
          >
            Más opciones
          </button>
        )}
      </div>
    </div>
  );
}

export function FormularioGestion({
  contexto,
  detalle,
  confirmacion,
  ordenInicial = 1,
}: {
  contexto: ContextoFormulario;
  detalle?: Detalle;
  confirmacion?: string;
  ordenInicial?: number;
}) {
  const [estado, accion, pendiente] = useActionState(
    guardarGestion.bind(null, contexto),
    {} as EstadoFormulario,
  );
  const [paso, setPaso] = useState(0),
    [guiado, setGuiado] = useState(true),
    [datos, setDatos] = useState<Record<string, string>>({});
  const formulario = useRef<HTMLFormElement>(null),
    tituloPaso = useRef<HTMLHeadingElement>(null),
    uid = useId();
  const { operacion, tipo } = contexto,
    r: Registro = detalle?.registro ?? { id: "" };
  const creando = operacion === "crear",
    editando = operacion === "editar",
    avanzando = operacion === "estado";
  const hijo: Tipo =
    tipo === "planes"
      ? "objetivos"
      : tipo === "objetivos"
        ? "acciones"
        : "actividades";
  const camposTipo = operacion === "agregar" ? hijo : tipo;
  const errores = estado.errores ?? {};
  const [nuevoEstado, setNuevoEstado] = useState(
    tipo === "planes"
      ? r.estado === "BORRADOR"
        ? "ACTIVO"
        : r.estado === "ACTIVO"
          ? "COMPLETADO"
          : "ARCHIVADO"
      : r.estado === "VENCIDO"
        ? "EN_PROGRESO"
        : (r.estado ?? "PLANIFICADO"),
  );
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (estado.mensaje) errorRef.current?.focus();
  }, [estado]);
  function campo(
    name: string,
    etiqueta: string,
    opciones: {
      tipo?: string;
      max?: number;
      ayuda?: string;
      requerido?: boolean;
      valor?: string | number | null;
    } = {},
  ) {
    const valor =
      estado.valores?.[name] ?? opciones.valor ?? r[name as keyof Registro];
    return (
      <Campo
        key={name}
        id={`${uid}-${name}`}
        name={name}
        etiqueta={etiqueta}
        type={opciones.tipo ?? "text"}
        defaultValue={
          valor === null || valor === undefined ? "" : String(valor)
        }
        maxLength={
          opciones.tipo === "number" ? undefined : (opciones.max ?? 220)
        }
        max={
          opciones.tipo === "datetime-local" && avanzando
            ? detalle?.hoy
            : undefined
        }
        step={
          opciones.tipo === "number"
            ? name === "orden"
              ? 1
              : "any"
            : undefined
        }
        min={name === "orden" ? 1 : undefined}
        required={opciones.requerido ?? true}
        error={errores[name]}
        ayuda={opciones.ayuda}
      />
    );
  }
  function area(
    name: string,
    etiqueta: string,
    ayuda?: string,
    requerido = true,
  ) {
    return (
      <div key={name}>
        <label htmlFor={`${uid}-${name}`} className="text-sm font-medium">
          {etiqueta}
        </label>
        <textarea
          id={`${uid}-${name}`}
          name={name}
          defaultValue={String(
            estado.valores?.[name] ?? r[name as keyof Registro] ?? "",
          )}
          rows={3}
          maxLength={
            name === "motivo"
              ? 500
              : name === "evidencia_esperada"
                ? 2000
                : 4000
          }
          required={requerido}
          className={CONTROL}
          aria-invalid={!!errores[name]}
          aria-describedby={
            errores[name] || ayuda ? `${uid}-${name}-ayuda` : undefined
          }
        />
        {(errores[name] || ayuda) && (
          <p
            id={`${uid}-${name}-ayuda`}
            className={`mt-1 text-sm ${errores[name] ? "text-destructive" : "text-muted-foreground"}`}
          >
            {errores[name] || ayuda}
          </p>
        )}
      </div>
    );
  }
  const responsable = (
    <SelectorGestion
      clase="personas"
      controlId={`${uid}-persona_responsable_id`}
      name="persona_responsable_id"
      etiqueta="Responsable principal"
      inicial={r.persona_responsable_id}
      nombreInicial={r.responsable}
      error={errores.persona_responsable_id}
    />
  );
  const plan = (
    <>
      {campo("nombre", "Nombre del Plan", {
        valor: r.nombre,
        ayuda:
          "Puedes tener distintos planes en el mismo año, usa nombres que permitan distinguirlos.",
      })}
      <SelectorGestion
        clase="anios"
        controlId={`${uid}-anio_academico_id`}
        name="anio_academico_id"
        etiqueta="Año académico"
        inicial={detalle?.anio_academico_id}
        nombreInicial={detalle ? String(detalle.anio) : ""}
        error={errores.anio_academico_id}
      />
    </>
  );
  const datosAccion = (
    <>
      {area("descripcion", "Qué se hará")}
      {responsable}
      {campo("publico_objetivo", "A quién está dirigida", {
        max: 180,
        ayuda: "Por ejemplo, estudiantes de primer año y sus familias.",
      })}
      {area(
        "evidencia_esperada",
        "Cómo se respaldará lo realizado",
        "Por ejemplo, lista de asistencia y fotografías del taller.",
      )}
    </>
  );
  function mover(siguiente: number) {
    if (siguiente > paso && formulario.current) {
      const activos = Array.from(
        formulario.current.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >(
          "[data-paso]:not([hidden]) input,[data-paso]:not([hidden]) select,[data-paso]:not([hidden]) textarea",
        ),
      );
      for (const el of activos) {
        if (!el.reportValidity()) return;
      }
    }
    if (formulario.current) {
      const valores = Object.fromEntries(
        Array.from(new FormData(formulario.current)).filter(
          (v): v is [string, string] => typeof v[1] === "string",
        ),
      );
      valores.anio_nombre =
        formulario.current.querySelector<HTMLSelectElement>(
          "select[name=anio_academico_id]",
        )?.selectedOptions[0]?.text ?? "";
      valores.responsable_nombre =
        formulario.current.querySelector<HTMLSelectElement>(
          "select[name=persona_responsable_id]",
        )?.selectedOptions[0]?.text ?? "";
      setDatos(valores);
    }
    setPaso(siguiente);
    requestAnimationFrame(() => tituloPaso.current?.focus());
  }
  let contenido: ReactNode;
  if (creando) {
    contenido = (
      <>
        <input type="hidden" name="confirmacion" value={confirmacion} />
        <input
          type="hidden"
          name="con_primera_accion"
          value={guiado ? "si" : "no"}
        />
        <div className="rounded-xl bg-accent p-4 text-sm text-accent-foreground">
          El Plan reúne lo que tu escuela quiere mejorar en convivencia durante
          el año, los objetivos indican qué se busca lograr y las acciones
          describen qué se hará.
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={guiado}
            onChange={(e) => {
              setGuiado(e.target.checked);
              setPaso(0);
            }}
            className="mt-1 size-4 accent-primary"
          />
          Preparar también el primer objetivo y su primera acción
        </label>
        <h2
          ref={tituloPaso}
          tabIndex={-1}
          className="text-lg font-semibold"
          aria-live="polite"
        >
          {paso === 0
            ? "Datos del Plan"
            : paso === 1
              ? "Primer objetivo"
              : paso === 2
                ? "Primera acción"
                : "Revisión antes de guardar"}
        </h2>
        <div data-paso hidden={paso !== 0} className="space-y-4">
          {plan}
        </div>
        {guiado && (
          <>
            <div data-paso hidden={paso !== 1} className="space-y-4">
              {campo("objetivo_titulo", "Qué quieres lograr", {
                ayuda:
                  "Por ejemplo, mejorar la resolución de conflictos entre estudiantes.",
              })}
              {area(
                "objetivo_descripcion",
                "Descripción del objetivo",
                undefined,
                false,
              )}
            </div>
            <div data-paso hidden={paso !== 2} className="space-y-4">
              {campo("accion_titulo", "Nombre de la primera acción", {
                ayuda:
                  "Por ejemplo, realizar talleres de resolución de conflictos.",
              })}
              {area("accion_descripcion", "Qué se hará")}
              {responsable}
              {campo("publico_objetivo", "A quién está dirigida", { max: 180 })}
              {area("evidencia_esperada", "Cómo se respaldará lo realizado")}
            </div>
          </>
        )}
        <div hidden={paso !== 3} className="space-y-3">
          <dl className="space-y-3 text-sm">
            {[
              ["Plan", datos.nombre],
              ["Año", datos.anio_nombre],
              ...(guiado
                ? [
                    ["Objetivo", datos.objetivo_titulo],
                    ...(datos.objetivo_descripcion
                      ? [
                          [
                            "Descripción del objetivo",
                            datos.objetivo_descripcion,
                          ],
                        ]
                      : []),
                    ["Acción", datos.accion_titulo],
                    ["Qué se hará", datos.accion_descripcion],
                    ["Responsable", datos.responsable_nombre],
                    ["Dirigida a", datos.publico_objetivo],
                    ["Evidencia esperada", datos.evidencia_esperada],
                  ]
                : []),
            ].map(([n, v]) => (
              <div key={n}>
                <dt className="text-muted-foreground">{n}</dt>
                <dd className="whitespace-pre-wrap font-medium">
                  {v || "Sin indicar"}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            {guiado
              ? "El Plan, el objetivo y la acción se guardarán juntos, el resultado se registrará después de realizar la acción."
              : "El Plan se guardará como borrador, después podrás añadir sus objetivos y acciones."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {paso > 0 && (
            <button
              type="button"
              className={claseBotonSecundario}
              onClick={() => mover(paso === 3 && !guiado ? 0 : paso - 1)}
            >
              Volver
            </button>
          )}
          {paso < 3 ? (
            <button
              key="continuar"
              type="button"
              className={claseBotonPrimario}
              onClick={(evento) => {
                evento.preventDefault();
                mover(!guiado ? 3 : paso + 1);
              }}
            >
              Continuar
            </button>
          ) : (
            <button
              key="confirmar"
              type="submit"
              name="confirmar_creacion"
              value="si"
              disabled={pendiente}
              className={claseBotonPrimario}
            >
              {pendiente ? "Guardando…" : "Confirmar y crear Plan"}
            </button>
          )}
        </div>
        {estado.mensaje && paso === 3 && (
          <button
            type="button"
            className="text-sm text-primary underline"
            onClick={() => mover(0)}
          >
            Revisar los datos del formulario
          </button>
        )}
      </>
    );
  } else if (operacion === "cursos" || operacion === "profesionales") {
    contenido = (
      <>
        <SelectorGestion
          clase={operacion}
          controlId={`${uid}-elegido_id`}
          name="elegido_id"
          etiqueta={operacion === "cursos" ? "Curso" : "Profesional"}
          actividadId={contexto.id}
          error={errores.elegido_id}
        />
        {operacion === "profesionales" &&
          campo("funcion", "Función en esta actividad", {
            max: 120,
            ayuda:
              "Por ejemplo, facilitar el taller o registrar la asistencia.",
          })}
      </>
    );
  } else if (avanzando) {
    const permitidos =
      tipo === "planes"
        ? r.estado === "BORRADOR"
          ? ["ACTIVO", "ARCHIVADO"]
          : r.estado === "ACTIVO"
            ? ["COMPLETADO", "ARCHIVADO"]
            : r.estado === "COMPLETADO"
              ? ["ARCHIVADO"]
              : []
        : ["PLANIFICADO", "EN_PROGRESO", "COMPLETADO", "CANCELADO"];
    contenido = (
      <>
        <label htmlFor={`${uid}-estado`} className="block text-sm font-medium">
          Estado
        </label>
        <select
          name="estado"
          id={`${uid}-estado`}
          className={CONTROL}
          value={nuevoEstado}
          onChange={(e) => setNuevoEstado(e.target.value)}
          required
        >
          <option value="">Selecciona un estado</option>
          {Array.from(
            new Set([
              ...(tipo === "planes" || r.estado === "VENCIDO"
                ? []
                : [r.estado ?? "PLANIFICADO"]),
              ...permitidos,
            ]),
          ).map((e) => (
            <option key={e} value={e}>
              {tipo === "planes" && e === "ACTIVO"
                ? "Aprobar y activar"
                : ESTADOS[e]}
            </option>
          ))}
        </select>
        {tipo === "planes" ? (
          <p className="text-sm text-muted-foreground">
            Al aprobar se registra quién lo aprobó y cuándo, el nombre y el año
            se conservan, al completar o archivar se dejan de admitir cambios.
          </p>
        ) : (
          <>
            {area(
              "resumen_resultado",
              "Qué se logró",
              undefined,
              nuevoEstado === "COMPLETADO",
            )}
            {tipo === "actividades" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {campo("inicio_real", "Inicio real", {
                  tipo: "datetime-local",
                  requerido: nuevoEstado === "COMPLETADO",
                })}
                {campo("fin_real", "Término real", {
                  tipo: "datetime-local",
                  requerido: nuevoEstado === "COMPLETADO",
                })}
              </div>
            )}
            {campo("completado_en", "Fecha de cumplimiento", {
              tipo: "datetime-local",
              requerido: nuevoEstado === "COMPLETADO",
            })}
            {tipo === "acciones" &&
              r.nombre_indicador &&
              campo(
                "valor_indicador",
                `Valor alcanzado en ${r.unidad_indicador}`,
                { tipo: "number", requerido: false },
              )}
          </>
        )}
        {area(
          "motivo",
          "Motivo del cambio",
          nuevoEstado === "CANCELADO"
            ? "La cancelación conserva el registro y su historia."
            : "Obligatorio para corregir un resultado ya completado.",
          nuevoEstado === "CANCELADO" || r.estado === "COMPLETADO",
        )}
      </>
    );
  } else {
    contenido = (
      <>
        {camposTipo === "planes" ? (
          plan
        ) : (
          <>
            {campo(
              "titulo",
              camposTipo === "objetivos"
                ? "Qué quieres lograr"
                : `Nombre de la ${camposTipo === "acciones" ? "acción" : "actividad"}`,
            )}
            {camposTipo === "objetivos" ? (
              <>
                {area("descripcion", "Descripción", undefined, false)}
                {campo("orden", "Orden dentro del Plan", {
                  tipo: "number",
                  valor: r.orden ?? ordenInicial,
                })}
              </>
            ) : camposTipo === "acciones" ? (
              <>
                {datosAccion}
                <fieldset className="space-y-4 border-t border-border pt-4">
                  <legend className="text-base font-semibold">
                    Cómo se medirá el resultado
                  </legend>
                  <p className="text-sm text-muted-foreground">
                    Un indicador es una medida para revisar el resultado, por
                    ejemplo número de talleres realizados.
                  </p>
                  {campo("nombre_indicador", "Qué se medirá", {
                    requerido: false,
                  })}
                  {campo("unidad_indicador", "Unidad de medida", {
                    max: 40,
                    requerido: false,
                    ayuda: "Por ejemplo, talleres, participantes o porcentaje.",
                  })}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {campo("meta_indicador", "Meta esperada", {
                      tipo: "number",
                      requerido: false,
                    })}
                    {campo("valor_indicador", "Valor alcanzado", {
                      tipo: "number",
                      requerido: false,
                    })}
                  </div>
                </fieldset>
              </>
            ) : (
              <>
                {area("descripcion", "Qué se realizará", undefined, false)}
                {responsable}
                <div className="grid gap-4 sm:grid-cols-2">
                  {campo("inicio_programado", "Inicio programado", {
                    tipo: "datetime-local",
                  })}
                  {campo("fin_programado", "Término programado", {
                    tipo: "datetime-local",
                  })}
                </div>
                {campo("lugar", "Lugar", { max: 160, requerido: false })}
              </>
            )}
          </>
        )}
        {editando &&
          (camposTipo === "acciones" || camposTipo === "actividades") &&
          area(
            "motivo",
            "Motivo de la corrección",
            "Se conservará el cambio anterior en el historial.",
          )}
      </>
    );
  }
  const rojo =
    avanzando && (nuevoEstado === "CANCELADO" || nuevoEstado === "ARCHIVADO");
  return (
    <FormularioConCarga
      ref={formulario}
      action={accion}
      className="space-y-5"
      noValidate={creando}
    >
      {detalle && (
        <input type="hidden" name="version" value={detalle.version} />
      )}
      {estado.mensaje && (
        <div ref={errorRef} tabIndex={-1}>
          <AvisoError>
            {estado.mensaje}
            {Object.keys(errores).length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {Object.entries(errores).map(([campo, mensaje]) => (
                  <li key={campo}>
                    <a className="underline" href={`#${uid}-${campo}`}>
                      {mensaje}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </AvisoError>
        </div>
      )}
      {contenido}
      {!creando && (
        <button
          disabled={pendiente}
          className={rojo ? ROJO : claseBotonPrimario}
        >
          {pendiente
            ? "Guardando…"
            : operacion === "agregar"
              ? `Añadir ${NOMBRES[hijo].toLowerCase()}`
              : operacion === "cursos"
                ? "Asociar curso"
                : operacion === "profesionales"
                  ? "Asignar profesional"
                  : avanzando
                    ? tipo === "planes" && nuevoEstado === "ACTIVO"
                      ? "Aprobar y activar"
                      : rojo
                        ? "Confirmar cambio"
                        : "Guardar avance"
                    : "Guardar cambios"}
        </button>
      )}
    </FormularioConCarga>
  );
}
