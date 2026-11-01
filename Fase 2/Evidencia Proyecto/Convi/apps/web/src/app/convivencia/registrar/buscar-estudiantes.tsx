"use client";

import { useId, useRef, useState } from "react";
import { claseBotonSecundario } from "@/app/components/formulario";
import { SelectorFiltro } from "@/app/components/selector-filtro";
import { ROLES_EN_SITUACION } from "@/app/profesor/situacion-opciones";

type Estudiante = {
  id: string;
  persona_id: string;
  nombres: string;
  apellidos: string;
  rut: string | null;
  curso: string | null;
};
export function BuscarEstudiantes({
  cursos,
  historico = false,
  informante = false,
}: {
  cursos: { id: string; nombre: string }[];
  historico?: boolean;
  informante?: boolean;
}) {
  const id = useId();
  const solicitud = useRef(0);
  const [buscar, setBuscar] = useState("");
  const [curso, setCurso] = useState("");
  const [estado, setEstado] = useState("");
  const [pendiente, setPendiente] = useState(false);
  const [resultados, setResultados] = useState<Estudiante[]>([]);
  const [seleccion, setSeleccion] = useState<(Estudiante & { rol: string })[]>(
    [],
  );
  async function consultar() {
    if (buscar.trim().length < 2 && !curso) {
      setEstado("Escribe al menos dos caracteres o elige un curso");
      return;
    }
    const numero = ++solicitud.current;
    setPendiente(true);
    setEstado("");
    try {
      const r = await fetch(
        `/convivencia/registrar/estudiantes?${new URLSearchParams({ buscar: buscar.trim(), curso, historico: historico ? "1" : "0" })}`,
      );
      if (!r.ok) throw new Error();
      const datos: { estudiantes: Estudiante[]; hay_mas: boolean } =
        await r.json();
      if (numero !== solicitud.current) return;
      setResultados(datos.estudiantes);
      setEstado(
        datos.hay_mas
          ? "Hay más coincidencias, precisa el nombre, RUT o curso para encontrarlas"
          : datos.estudiantes.length
            ? `${datos.estudiantes.length} coincidencias`
            : "No encontramos estudiantes con esos datos",
      );
    } catch {
      if (numero === solicitud.current)
        setEstado("No pudimos completar la búsqueda, inténtalo nuevamente");
    } finally {
      if (numero === solicitud.current) setPendiente(false);
    }
  }
  function agregar(e: Estudiante) {
    setSeleccion((prev) =>
      informante
        ? [{ ...e, rol: "" }]
        : prev.some((x) => x.id === e.id)
          ? prev
          : [...prev, { ...e, rol: "INVOLUCRADO" }],
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {informante
          ? "Busca al estudiante que informó, es opcional"
          : historico
            ? "Busca estudiantes actuales o anteriores, el curso histórico se obtiene de la fecha del hecho"
            : "Busca estudiantes activos y matriculados, puedes agregar participantes de distintos cursos"}
      </p>
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label htmlFor={id} className="text-sm font-medium">
          Nombre, apellido o RUT
          <input
            id={id}
            type="search"
            maxLength={100}
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void consultar();
              }
            }}
            className="mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15"
          />
        </label>
        <SelectorFiltro
          nombre={`${id}-curso`}
          etiqueta="Curso actual"
          valor={curso}
          cambiar={setCurso}
          opciones={[
            ["", "Todos los cursos"],
            ...cursos.map((c) => [c.id, c.nombre] as [string, string]),
          ]}
        />
        <button
          type="button"
          disabled={pendiente}
          onClick={() => void consultar()}
          className={claseBotonSecundario}
        >
          {pendiente ? "Buscando…" : "Buscar"}
        </button>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {estado}
      </p>
      {resultados.length > 0 && (
        <ul className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {resultados.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {e.nombres} {e.apellidos}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.rut || "RUT sin registrar"} ·{" "}
                  {e.curso || "Sin matrícula actual"}
                </p>
              </div>
              <button
                type="button"
                disabled={seleccion.some((x) => x.id === e.id)}
                onClick={() => agregar(e)}
                className={claseBotonSecundario}
              >
                {seleccion.some((x) => x.id === e.id)
                  ? "Seleccionado"
                  : "Seleccionar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {seleccion.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-semibold">
            {informante
              ? "Persona que informó"
              : `${seleccion.length} participantes seleccionados`}
          </p>
          {seleccion.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-3"
            >
              <p className="min-w-0 flex-1 text-sm font-medium">
                {e.nombres} {e.apellidos}
              </p>
              {informante ? (
                <input
                  type="hidden"
                  name="informante_persona_id"
                  value={e.persona_id}
                />
              ) : (
                <SelectorFiltro
                  nombre={`rol:${e.id}`}
                  etiqueta={`Rol de ${e.nombres}`}
                  valor={e.rol}
                  opciones={ROLES_EN_SITUACION.map((r) => [r.valor, r.texto])}
                  cambiar={(rol) =>
                    setSeleccion((prev) =>
                      prev.map((x) => (x.id === e.id ? { ...x, rol } : x)),
                    )
                  }
                />
              )}
              <button
                type="button"
                onClick={() =>
                  setSeleccion((prev) => prev.filter((x) => x.id !== e.id))
                }
                className="rounded-lg px-3 py-2 text-sm text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                Quitar<span className="sr-only"> a {e.nombres}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
