"use client";

import { useActionState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import type { EstadoAccion } from "./acciones";
import {
  agregarAsistentes,
  cancelarEncuentro,
  programarEncuentro,
  registrarEncuentro,
  reprogramarEncuentro,
} from "./acciones-encuentros";
import { Campo, propsControl } from "./formularios";
import {
  ASISTENCIAS,
  LARGO_MAXIMO_DESCRIPCION_ENCUENTRO,
  LARGO_MAXIMO_LUGAR,
  LARGO_MAXIMO_MOTIVO_PLAN,
  LARGO_MAXIMO_OBJETIVO_ENCUENTRO,
  LARGO_MAXIMO_RESULTADO,
  NOMBRE_PERFIL_RESPONSABLE,
  NOMBRE_ROL_ASISTENTE,
  TIPOS_ENCUENTRO,
} from "./opciones";

// PB-063 y PB-064 (HU-055): formularios de los encuentros del caso. Varios
// conviven en la página, así que cada control lleva un id propio y el nombre
// del campo que espera la API.
const estadoInicial: EstadoAccion = {};

type Posible = {
  persona_id: string;
  rol: string;
  nombre: string;
  detalle: string | null;
};

function ErrorGeneral({ estado }: { estado: EstadoAccion }) {
  return estado.mensaje && !estado.errores ? (
    <AvisoError>{estado.mensaje}</AvisoError>
  ) : null;
}

function textoDetalle(posible: Posible) {
  if (!posible.detalle) return null;
  if (posible.rol !== "EQUIPO") return posible.detalle;
  return posible.detalle
    .split(", ")
    .map((perfil) => NOMBRE_PERFIL_RESPONSABLE[perfil] ?? perfil)
    .join(", ");
}

/** CA4: casillas de asistentes agrupadas por rol; el valor es "ROL:persona". */
function CamposAsistentes({
  sufijo,
  posibles,
  marcados,
  error,
}: {
  sufijo: string;
  posibles: Posible[];
  marcados: string;
  error?: string;
}) {
  const elegidos = new Set(marcados ? marcados.split(",") : []);
  const grupos = ["ESTUDIANTE", "APODERADO", "EQUIPO"]
    .map((rol) => ({ rol, personas: posibles.filter((p) => p.rol === rol) }))
    .filter((grupo) => grupo.personas.length > 0);
  return (
    <fieldset
      aria-describedby={error ? `asistentes_${sufijo}-error` : undefined}
      className={`rounded-lg border p-3 ${error ? "border-destructive" : "border-input"}`}
    >
      <legend className="px-1 text-sm font-medium">Asistentes</legend>
      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay más personas para agregar.</p>
      ) : (
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {grupos.map((grupo) => (
            <div key={grupo.rol}>
              <p className="text-xs font-medium text-muted-foreground">
                {NOMBRE_ROL_ASISTENTE[grupo.rol]}
              </p>
              <ul className="mt-1 space-y-1">
                {grupo.personas.map((persona) => {
                  const valor = `${persona.rol}:${persona.persona_id}`;
                  const id = `asistente_${sufijo}_${persona.rol}_${persona.persona_id.slice(0, 8)}`;
                  const detalle = textoDetalle(persona);
                  return (
                    <li key={valor} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        id={id}
                        name="asistentes"
                        value={valor}
                        defaultChecked={elegidos.has(valor)}
                        className="mt-0.5 accent-primary"
                      />
                      <label htmlFor={id}>
                        {persona.nombre}
                        {detalle && (
                          <span className="ml-1 text-xs text-muted-foreground">({detalle})</span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p id={`asistentes_${sufijo}-error`} className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

// PB-063 (CA1 a CA4): tipo, objetivo, responsable de Convivencia, lugar, fecha
// programada y asistentes; el término, la descripción y la acción del plan son
// opcionales. Quien lo registra queda como autor.
export function FormularioNuevoEncuentro({
  casoId,
  responsables,
  asistentes,
  acciones,
}: {
  casoId: string;
  responsables: { id: string; nombre: string }[];
  asistentes: Posible[];
  acciones: { id: string; descripcion: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(
    programarEncuentro,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <ErrorGeneral estado={estado} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="encuentro_tipo" etiqueta="Tipo de encuentro" error={errores.tipo}>
          <select
            {...propsControl("encuentro_tipo", errores.tipo, false, "tipo")}
            defaultValue={valores.tipo ?? ""}
          >
            <option value="" disabled>
              Elige un tipo
            </option>
            {TIPOS_ENCUENTRO.map((tipo) => (
              <option key={tipo.valor} value={tipo.valor}>
                {tipo.texto}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          id="encuentro_responsable"
          etiqueta="Responsable de Convivencia"
          error={errores.responsable_id}
        >
          <select
            {...propsControl(
              "encuentro_responsable",
              errores.responsable_id,
              false,
              "responsable_id",
            )}
            defaultValue={valores.responsable_id ?? ""}
          >
            <option value="" disabled>
              Elige a una persona de Convivencia
            </option>
            {responsables.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <Campo id="encuentro_objetivo" etiqueta="Objetivo" error={errores.objetivo}>
        <textarea
          {...propsControl("encuentro_objetivo", errores.objetivo, false, "objetivo")}
          rows={2}
          maxLength={LARGO_MAXIMO_OBJETIVO_ENCUENTRO}
          defaultValue={valores.objetivo}
        />
      </Campo>

      <Campo
        id="encuentro_descripcion"
        etiqueta="Descripción (opcional)"
        error={errores.descripcion}
      >
        <textarea
          {...propsControl(
            "encuentro_descripcion",
            errores.descripcion,
            false,
            "descripcion",
          )}
          rows={2}
          maxLength={LARGO_MAXIMO_DESCRIPCION_ENCUENTRO}
          defaultValue={valores.descripcion}
        />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="encuentro_lugar" etiqueta="Lugar" error={errores.lugar}>
          <input
            {...propsControl("encuentro_lugar", errores.lugar, false, "lugar")}
            type="text"
            maxLength={LARGO_MAXIMO_LUGAR}
            placeholder="Por ejemplo: oficina de Convivencia"
            defaultValue={valores.lugar}
          />
        </Campo>
        <Campo
          id="encuentro_inicio"
          etiqueta="Fecha y hora programadas"
          error={errores.programado_en}
        >
          <input
            {...propsControl(
              "encuentro_inicio",
              errores.programado_en,
              false,
              "programado_en",
            )}
            type="datetime-local"
            defaultValue={valores.programado_en}
          />
        </Campo>
        <Campo
          id="encuentro_fin"
          etiqueta="Término programado (opcional)"
          error={errores.fin_programado_en}
        >
          <input
            {...propsControl(
              "encuentro_fin",
              errores.fin_programado_en,
              false,
              "fin_programado_en",
            )}
            type="datetime-local"
            defaultValue={valores.fin_programado_en}
          />
        </Campo>
      </div>

      {acciones.length > 0 && (
        <Campo
          id="encuentro_accion"
          etiqueta="Acción del plan de intervención (opcional)"
          error={errores.accion_plan_id}
        >
          <select
            {...propsControl(
              "encuentro_accion",
              errores.accion_plan_id,
              false,
              "accion_plan_id",
            )}
            defaultValue={valores.accion_plan_id ?? ""}
          >
            <option value="">Sin acción del plan</option>
            {acciones.map((a) => (
              <option key={a.id} value={a.id}>
                {a.descripcion}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <CamposAsistentes
        sufijo="nuevo"
        posibles={asistentes}
        marcados={valores.asistentes ?? ""}
        error={errores.asistentes}
      />

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Programando…" : "Programar encuentro"}
      </button>
    </form>
  );
}

// Decisión del PO (por defecto): mientras no se realice se suman asistentes.
export function FormularioAgregarAsistentes({
  casoId,
  encuentroId,
  posibles,
}: {
  casoId: string;
  encuentroId: string;
  posibles: Posible[];
}) {
  const [estado, accion, pendiente] = useActionState(
    agregarAsistentes,
    estadoInicial,
  );
  const errores = estado.errores ?? {};

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="encuentro_id" value={encuentroId} />
      <ErrorGeneral estado={estado} />
      <CamposAsistentes
        sufijo={encuentroId.slice(0, 8)}
        posibles={posibles}
        marcados={estado.valores?.asistentes ?? ""}
        error={errores.asistentes}
      />
      {posibles.length > 0 && (
        <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
          {pendiente ? "Agregando…" : "Agregar asistentes"}
        </button>
      )}
    </form>
  );
}

// PB-063 (CA5): cambiar la fecha exige motivo; la fecha anterior queda en la
// auditoría y en la cronología del caso.
export function FormularioReprogramacion({
  casoId,
  encuentroId,
  version,
  programado,
  finProgramado,
}: {
  casoId: string;
  encuentroId: string;
  version: string;
  programado: string | null;
  finProgramado: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(
    reprogramarEncuentro,
    estadoInicial,
  );
  const valores = estado.valores ?? {
    programado_en: programado ?? "",
    fin_programado_en: finProgramado ?? "",
  };
  const errores = estado.errores ?? {};
  const sufijo = encuentroId.slice(0, 8);

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="encuentro_id" value={encuentroId} />
      <input type="hidden" name="version" value={version} />
      <ErrorGeneral estado={estado} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id={`reprogramar_inicio_${sufijo}`}
          etiqueta="Nueva fecha y hora"
          error={errores.programado_en}
        >
          <input
            {...propsControl(
              `reprogramar_inicio_${sufijo}`,
              errores.programado_en,
              false,
              "programado_en",
            )}
            type="datetime-local"
            defaultValue={valores.programado_en}
          />
        </Campo>
        <Campo
          id={`reprogramar_fin_${sufijo}`}
          etiqueta="Nuevo término (opcional)"
          error={errores.fin_programado_en}
        >
          <input
            {...propsControl(
              `reprogramar_fin_${sufijo}`,
              errores.fin_programado_en,
              false,
              "fin_programado_en",
            )}
            type="datetime-local"
            defaultValue={valores.fin_programado_en}
          />
        </Campo>
      </div>
      <Campo
        id={`reprogramar_motivo_${sufijo}`}
        etiqueta="Motivo del cambio"
        error={errores.motivo}
        ayuda="Queda en la auditoría con la fecha anterior y la nueva. El encuentro queda Pospuesto."
      >
        <textarea
          {...propsControl(`reprogramar_motivo_${sufijo}`, errores.motivo, true, "motivo")}
          rows={2}
          maxLength={LARGO_MAXIMO_MOTIVO_PLAN}
          defaultValue={valores.motivo}
        />
      </Campo>
      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Reprogramar"}
      </button>
    </form>
  );
}

// PB-064 (CA2 a CA4 y CA6): inicio real obligatorio y término opcional, que
// no pueden ser futuros; resultado y la asistencia de cada participante.
export function FormularioRealizacion({
  casoId,
  encuentroId,
  version,
  ahora,
  asistentes,
}: {
  casoId: string;
  encuentroId: string;
  version: string;
  ahora: string;
  asistentes: { participacion_id: string; nombre: string; rol: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(
    registrarEncuentro,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const sufijo = encuentroId.slice(0, 8);

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="encuentro_id" value={encuentroId} />
      <input type="hidden" name="version" value={version} />
      <ErrorGeneral estado={estado} />
      {errores.asistencia && <AvisoError>{errores.asistencia}</AvisoError>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id={`real_inicio_${sufijo}`}
          etiqueta="Inicio real"
          error={errores.realizado_en}
          ayuda="No puede ser una fecha futura."
        >
          <input
            {...propsControl(
              `real_inicio_${sufijo}`,
              errores.realizado_en,
              true,
              "realizado_en",
            )}
            type="datetime-local"
            max={ahora}
            defaultValue={valores.realizado_en}
          />
        </Campo>
        <Campo
          id={`real_fin_${sufijo}`}
          etiqueta="Término real (opcional)"
          error={errores.fin_real_en}
        >
          <input
            {...propsControl(`real_fin_${sufijo}`, errores.fin_real_en, false, "fin_real_en")}
            type="datetime-local"
            max={ahora}
            defaultValue={valores.fin_real_en}
          />
        </Campo>
      </div>
      <Campo id={`real_resultado_${sufijo}`} etiqueta="Resultado" error={errores.resultado}>
        <textarea
          {...propsControl(`real_resultado_${sufijo}`, errores.resultado, false, "resultado")}
          rows={3}
          maxLength={LARGO_MAXIMO_RESULTADO}
          defaultValue={valores.resultado}
        />
      </Campo>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Asistencia</legend>
        {asistentes.map((a) => {
          const campo = `asistencia_${a.participacion_id}`;
          const id = `asistencia_${sufijo}_${a.participacion_id.slice(0, 8)}`;
          return (
            <Campo
              key={a.participacion_id}
              id={id}
              etiqueta={`${a.nombre} (${NOMBRE_ROL_ASISTENTE[a.rol] ?? a.rol})`}
              error={errores[campo]}
            >
              <select
                {...propsControl(id, errores[campo], false, campo)}
                defaultValue={valores[campo] ?? ""}
              >
                <option value="" disabled>
                  Elige la asistencia
                </option>
                {ASISTENCIAS.map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>
                    {opcion.texto}
                  </option>
                ))}
              </select>
            </Campo>
          );
        })}
      </fieldset>
      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Registrar como realizado"}
      </button>
    </form>
  );
}

// Decisión del PO (por defecto): cancelar exige motivo; el encuentro se conserva.
export function FormularioCancelacionEncuentro({
  casoId,
  encuentroId,
  version,
}: {
  casoId: string;
  encuentroId: string;
  version: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    cancelarEncuentro,
    estadoInicial,
  );
  const errores = estado.errores ?? {};
  const sufijo = encuentroId.slice(0, 8);

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="encuentro_id" value={encuentroId} />
      <input type="hidden" name="version" value={version} />
      <ErrorGeneral estado={estado} />
      <Campo
        id={`cancelar_motivo_${sufijo}`}
        etiqueta="Motivo de la cancelación"
        error={errores.motivo}
      >
        <textarea
          {...propsControl(`cancelar_motivo_${sufijo}`, errores.motivo, false, "motivo")}
          rows={2}
          maxLength={LARGO_MAXIMO_MOTIVO_PLAN}
          defaultValue={estado.valores?.motivo}
        />
      </Campo>
      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Cancelando…" : "Cancelar encuentro"}
      </button>
    </form>
  );
}
