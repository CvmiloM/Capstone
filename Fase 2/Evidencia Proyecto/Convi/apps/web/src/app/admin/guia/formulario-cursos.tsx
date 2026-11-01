"use client";

import { useActionState, useState } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { guardarCursos, type EstadoGuia } from "./acciones";
import {
  mismoNivel,
  NIVELES_GUIA,
  SECCIONES_MAXIMAS,
  secciones,
} from "./opciones";

// PB-034 (HU-027): se elige el año, la enseñanza, los niveles y las secciones,
// se revisa la vista previa marcando lo que ya existe (CA3) y nada se crea
// hasta confirmar (CA2).
const estadoInicial: EstadoGuia = {};
const claseCampo =
  "mt-1.5 block w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15";

type Academico = {
  anios: { id: string; anio: number; estado: string }[];
  niveles: { nombre: string; ciclo: string; activo: boolean }[];
  cursos: { anio: number; nivel: string; ciclo: string; seccion: string | null }[];
};

export function FormularioCursos({
  version,
  academico,
  anioPorDefecto,
}: {
  version: string;
  academico: Academico;
  anioPorDefecto: number;
}) {
  const [estado, accion, pendiente] = useActionState(
    guardarCursos,
    estadoInicial,
  );
  const errores = estado.errores ?? {};
  const [anio, setAnio] = useState(String(anioPorDefecto));
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(
    () =>
      new Set(
        NIVELES_GUIA.filter((n) => n.ciclo === "BASICA").map((n) => n.clave),
      ),
  );
  const [porNivel, setPorNivel] = useState<Record<string, number>>({});
  const [general, setGeneral] = useState(1);
  const [activar, setActivar] = useState(true);
  const [vista, setVista] = useState(false);

  const numeroAnio = Number(anio);
  const anioExistente = academico.anios.find((a) => a.anio === numeroAnio);
  const hayActivo = academico.anios.some((a) => a.estado === "ACTIVO");
  const ofrecerActivar =
    !hayActivo && (!anioExistente || anioExistente.estado === "PLANIFICADO");
  const cantidad = (clave: string) => porNivel[clave] ?? general;
  const elegidosEnOrden = NIVELES_GUIA.filter((n) => elegidos.has(n.clave));

  const nivelExistente = (nombre: string, ciclo: string) =>
    academico.niveles.find(
      (n) => n.ciclo === ciclo && mismoNivel(n.nombre, nombre),
    );
  const cursoExiste = (nombre: string, ciclo: string, seccion: string) =>
    academico.cursos.some(
      (c) =>
        c.anio === numeroAnio &&
        c.ciclo === ciclo &&
        mismoNivel(c.nivel, nombre) &&
        (c.seccion ?? "").toUpperCase() === seccion,
    );

  const propuestos = elegidosEnOrden.flatMap((n) =>
    secciones(cantidad(n.clave)).map((s) => ({
      nombre: `${n.nombre} ${s}`,
      existe: cursoExiste(n.nombre, n.ciclo, s),
    })),
  );
  const nuevos = propuestos.filter((c) => !c.existe).length;
  const desactivados = elegidosEnOrden.filter(
    (n) => nivelExistente(n.nombre, n.ciclo)?.activo === false,
  );

  function cambiarEnsenanza(ciclo: "BASICA" | "MEDIA", marcar: boolean) {
    setElegidos((actual) => {
      const nuevo = new Set(actual);
      for (const n of NIVELES_GUIA.filter((x) => x.ciclo === ciclo))
        if (marcar) nuevo.add(n.clave);
        else nuevo.delete(n.clave);
      return nuevo;
    });
  }

  function cambiarNivel(clave: string, marcar: boolean) {
    setElegidos((actual) => {
      const nuevo = new Set(actual);
      if (marcar) nuevo.add(clave);
      else nuevo.delete(clave);
      return nuevo;
    });
  }

  return (
    <form action={accion} noValidate className="space-y-6">
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="anio" value={anio} />
      <input type="hidden" name="fecha_inicio" value={fechaInicio} />
      <input type="hidden" name="fecha_fin" value={fechaFin} />
      <input
        type="hidden"
        name="activar"
        value={String(ofrecerActivar && activar)}
      />
      <input
        type="hidden"
        name="niveles"
        value={JSON.stringify(
          elegidosEnOrden.map((n) => ({
            clave: n.clave,
            secciones: cantidad(n.clave),
          })),
        )}
      />
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      {Object.values(errores).length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {Object.entries(errores).map(([campo, texto]) => (
            <li key={campo}>{texto}</li>
          ))}
        </ul>
      )}

      {!vista ? (
        <>
          <section className="space-y-3">
            <h3 className="font-semibold">1. Año académico</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="anio" className="block text-sm font-medium">
                  Año
                </label>
                <input
                  id="anio"
                  type="number"
                  min={2000}
                  max={2200}
                  value={anio}
                  onChange={(e) => setAnio(e.target.value)}
                  className={claseCampo}
                />
              </div>
              {!anioExistente && (
                <>
                  <div>
                    <label
                      htmlFor="fecha_inicio"
                      className="block text-sm font-medium"
                    >
                      Inicio (opcional)
                    </label>
                    <input
                      id="fecha_inicio"
                      type="date"
                      value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)}
                      className={claseCampo}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="fecha_fin"
                      className="block text-sm font-medium"
                    >
                      Término (opcional)
                    </label>
                    <input
                      id="fecha_fin"
                      type="date"
                      value={fechaFin}
                      onChange={(e) => setFechaFin(e.target.value)}
                      className={claseCampo}
                    />
                  </div>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {anioExistente
                ? `El año ${anioExistente.anio} ya existe (${anioExistente.estado === "ACTIVO" ? "Activo" : anioExistente.estado === "PLANIFICADO" ? "Planificado" : "Cerrado"}): los cursos se agregan a ese año.`
                : "Se creará como Planificado, igual que en Años académicos."}
            </p>
            {ofrecerActivar && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={activar}
                  onChange={(e) => setActivar(e.target.checked)}
                  className="accent-primary"
                />
                Activar el año al confirmar (tu escuela todavía no tiene un año
                activo)
              </label>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">2. Enseñanza y niveles</h3>
            {(["BASICA", "MEDIA"] as const).map((ciclo) => {
              const delCiclo = NIVELES_GUIA.filter((n) => n.ciclo === ciclo);
              const todos = delCiclo.every((n) => elegidos.has(n.clave));
              return (
                <fieldset
                  key={ciclo}
                  className="rounded-xl border border-border p-4"
                >
                  <legend className="px-1">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={todos}
                        onChange={(e) =>
                          cambiarEnsenanza(ciclo, e.target.checked)
                        }
                        className="accent-primary"
                      />
                      {ciclo === "BASICA"
                        ? "Enseñanza Básica (1° a 8°)"
                        : "Enseñanza Media (1° a 4°)"}
                    </label>
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {delCiclo.map((n) => (
                      <label
                        key={n.clave}
                        className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={elegidos.has(n.clave)}
                          onChange={(e) =>
                            cambiarNivel(n.clave, e.target.checked)
                          }
                          className="accent-primary"
                        />
                        {n.nombre}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">3. Secciones</h3>
            <div className="max-w-xs">
              <label htmlFor="general" className="block text-sm font-medium">
                Secciones por nivel
              </label>
              <select
                id="general"
                value={general}
                onChange={(e) => {
                  setGeneral(Number(e.target.value));
                  setPorNivel({});
                }}
                className={claseCampo}
              >
                {secciones(SECCIONES_MAXIMAS).map((s, i) => (
                  <option key={s} value={i + 1}>
                    {i + 1} ({secciones(i + 1).join(", ")})
                  </option>
                ))}
              </select>
            </div>
            {elegidosEnOrden.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Cambiar la cantidad en un nivel
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {elegidosEnOrden.map((n) => (
                    <label key={n.clave} className="text-sm">
                      {n.nombre}
                      <select
                        value={cantidad(n.clave)}
                        onChange={(e) =>
                          setPorNivel((a) => ({
                            ...a,
                            [n.clave]: Number(e.target.value),
                          }))
                        }
                        className={claseCampo}
                      >
                        {secciones(SECCIONES_MAXIMAS).map((s, i) => (
                          <option key={s} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </details>
            )}
          </section>

          <button
            type="button"
            disabled={elegidosEnOrden.length === 0}
            onClick={() => setVista(true)}
            className={claseBotonPrimario}
          >
            Ver vista previa
          </button>
        </>
      ) : (
        <section className="space-y-4">
          <h3 className="font-semibold">Vista previa del año {anio}</h3>
          <p className="text-sm">
            Se crearán <strong>{nuevos}</strong>{" "}
            {nuevos === 1 ? "curso" : "cursos"}
            {propuestos.length > nuevos &&
              ` (${propuestos.length - nuevos} ya existen y no se repiten)`}
            .{" "}
            {!anioExistente &&
              `También se crea el año ${anio}${ofrecerActivar && activar ? " y queda activo" : " como Planificado"}.`}
          </p>
          {desactivados.length > 0 && (
            <AvisoError>
              {desactivados.map((n) => n.nombre).join(", ")}{" "}
              {desactivados.length === 1 ? "está desactivado" : "están desactivados"}{" "}
              en Niveles educativos. Actívalos allí o desmárcalos.
            </AvisoError>
          )}
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {elegidosEnOrden.map((n) => {
              const previo = nivelExistente(n.nombre, n.ciclo);
              return (
                <li
                  key={n.clave}
                  className="rounded-xl border border-border bg-card p-3 text-sm"
                >
                  <p className="font-medium">
                    {n.nombre}{" "}
                    <span className="text-xs text-muted-foreground">
                      {previo ? "nivel ya existe" : "nivel nuevo"}
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {secciones(cantidad(n.clave)).map((s) => {
                      const existe = cursoExiste(n.nombre, n.ciclo, s);
                      return (
                        <span
                          key={s}
                          className={`rounded-full px-2 py-0.5 text-xs ${existe ? "bg-muted text-muted-foreground" : "bg-verde/15 text-tinta"}`}
                        >
                          {s}
                          {existe ? " (ya existe)" : ""}
                        </span>
                      );
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pendiente || desactivados.length > 0}
              className={claseBotonPrimario}
            >
              {pendiente ? "Creando…" : "Confirmar y crear"}
            </button>
            <button
              type="button"
              onClick={() => setVista(false)}
              className={claseBotonSecundario}
            >
              Volver a editar
            </button>
          </div>
        </section>
      )}
    </form>
  );
}
