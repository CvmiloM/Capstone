"use client";

import { useActionState, useState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import type { EstadoAccion } from "./acciones";
import {
  agregarAccionPlan,
  avanzarAccionPlan,
  cambiarEstadoPlan,
  corregirAccionPlan,
  crearPlan,
} from "./acciones-plan";
import { Campo, propsControl } from "./formularios";
import {
  LARGO_MAXIMO_DESCRIPCION_ACCION,
  LARGO_MAXIMO_MOTIVO_PLAN,
  LARGO_MAXIMO_NOTAS_ACCION,
  LARGO_MAXIMO_OBJETIVO_PLAN,
  NOMBRE_ESTADO_PLAN,
  NOMBRE_PERFIL_RESPONSABLE,
} from "./opciones";

// PB-061 y PB-062 (HU-054): formularios del plan de intervención y sus
// acciones. Varios conviven en la página, así que cada control lleva un id
// propio y el nombre del campo que espera la API.
const estadoInicial: EstadoAccion = {};

type Responsable = { id: string; nombre: string; perfiles: string[] };

function textoResponsable(persona: Responsable) {
  const perfiles = persona.perfiles
    .map((perfil) => NOMBRE_PERFIL_RESPONSABLE[perfil] ?? perfil)
    .join(", ");
  return `${persona.nombre} (${perfiles || "sin cuenta activa"})`;
}

function ErrorGeneral({ estado }: { estado: EstadoAccion }) {
  return estado.mensaje && !estado.errores ? (
    <AvisoError>{estado.mensaje}</AvisoError>
  ) : null;
}

// CA1: el plan pertenece al caso, con objetivo, estado y, si corresponde, el
// protocolo aplicado del mismo caso que lo origina.
export function FormularioNuevoPlan({
  casoId,
  protocolos,
}: {
  casoId: string;
  protocolos: { id: string; nombre: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(crearPlan, estadoInicial);
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <ErrorGeneral estado={estado} />

      <Campo id="plan_objetivo" etiqueta="Objetivo del plan" error={errores.objetivo}>
        <textarea
          {...propsControl("plan_objetivo", errores.objetivo, false, "objetivo")}
          rows={3}
          maxLength={LARGO_MAXIMO_OBJETIVO_PLAN}
          defaultValue={valores.objetivo}
        />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="plan_estado"
          etiqueta="Estado inicial"
          error={errores.estado}
          ayuda="Borrador mientras lo preparas; Activo cuando empieza a ejecutarse."
        >
          <select
            {...propsControl("plan_estado", errores.estado, true, "estado")}
            defaultValue={valores.estado ?? "BORRADOR"}
          >
            <option value="BORRADOR">{NOMBRE_ESTADO_PLAN.BORRADOR}</option>
            <option value="ACTIVO">{NOMBRE_ESTADO_PLAN.ACTIVO}</option>
          </select>
        </Campo>

        <Campo
          id="plan_protocolo"
          etiqueta="Protocolo que lo origina (opcional)"
          error={errores.protocolo_caso_id}
        >
          <select
            {...propsControl(
              "plan_protocolo",
              errores.protocolo_caso_id,
              false,
              "protocolo_caso_id",
            )}
            defaultValue={valores.protocolo_caso_id ?? ""}
          >
            <option value="">Sin protocolo de origen</option>
            {protocolos.map((protocolo) => (
              <option key={protocolo.id} value={protocolo.id}>
                {protocolo.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Creando…" : "Crear plan"}
      </button>
    </form>
  );
}

// CA5: un borrador se activa; el plan se completa o cancela en cualquier
// momento, aunque queden acciones pendientes, indicando un motivo.
export function FormularioEstadoPlan({
  casoId,
  planId,
  version,
  estadoActual,
}: {
  casoId: string;
  planId: string;
  version: string;
  estadoActual: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    cambiarEstadoPlan,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const opciones = (
    estadoActual === "BORRADOR"
      ? ["ACTIVO", "COMPLETADO", "CANCELADO"]
      : ["COMPLETADO", "CANCELADO"]
  ).map((valor) => ({ valor, texto: NOMBRE_ESTADO_PLAN[valor] }));
  const sufijo = planId.slice(0, 8);

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="version" value={version} />
      <ErrorGeneral estado={estado} />

      <Campo
        id={`plan_estado_nuevo_${sufijo}`}
        etiqueta="Nuevo estado del plan"
        error={errores.estado_nuevo}
      >
        <select
          {...propsControl(
            `plan_estado_nuevo_${sufijo}`,
            errores.estado_nuevo,
            false,
            "estado_nuevo",
          )}
          defaultValue={valores.estado_nuevo ?? ""}
        >
          <option value="" disabled>
            Elige un estado
          </option>
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
      </Campo>

      <Campo
        id={`plan_motivo_${sufijo}`}
        etiqueta="Motivo"
        error={errores.motivo}
        ayuda="Obligatorio para completar o cancelar. Queda en la auditoría con tu nombre y la fecha de término."
      >
        <textarea
          {...propsControl(`plan_motivo_${sufijo}`, errores.motivo, true, "motivo")}
          rows={2}
          maxLength={LARGO_MAXIMO_MOTIVO_PLAN}
          defaultValue={valores.motivo}
        />
      </Campo>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Cambiar estado del plan"}
      </button>
    </form>
  );
}

// CA2: cada acción tiene descripción, persona responsable y fecha de
// vencimiento, y empieza Pendiente.
export function FormularioNuevaAccion({
  casoId,
  planId,
  responsables,
  hoy,
}: {
  casoId: string;
  planId: string;
  responsables: Responsable[];
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    agregarAccionPlan,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const sufijo = planId.slice(0, 8);

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="plan_id" value={planId} />
      <ErrorGeneral estado={estado} />

      <CamposAccion
        sufijo={`nueva_${sufijo}`}
        valores={valores}
        errores={errores}
        responsables={responsables}
        hoy={hoy}
      />

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Agregando…" : "Agregar acción"}
      </button>
    </form>
  );
}

/** Descripción, responsable y vencimiento: los datos que define una acción. */
function CamposAccion({
  sufijo,
  valores,
  errores,
  responsables,
  hoy,
}: {
  sufijo: string;
  valores: Record<string, string>;
  errores: Record<string, string>;
  responsables: Responsable[];
  hoy: string;
}) {
  return (
    <>
      <Campo
        id={`accion_descripcion_${sufijo}`}
        etiqueta="Descripción"
        error={errores.descripcion}
      >
        <textarea
          {...propsControl(
            `accion_descripcion_${sufijo}`,
            errores.descripcion,
            false,
            "descripcion",
          )}
          rows={2}
          maxLength={LARGO_MAXIMO_DESCRIPCION_ACCION}
          defaultValue={valores.descripcion}
        />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id={`accion_responsable_${sufijo}`}
          etiqueta="Persona responsable"
          error={errores.persona_responsable_id}
        >
          <select
            {...propsControl(
              `accion_responsable_${sufijo}`,
              errores.persona_responsable_id,
              false,
              "persona_responsable_id",
            )}
            defaultValue={valores.persona_responsable_id ?? ""}
          >
            <option value="" disabled>
              Elige a una persona del equipo
            </option>
            {responsables.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {textoResponsable(persona)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          id={`accion_vence_${sufijo}`}
          etiqueta="Fecha de vencimiento"
          error={errores.vence_dia}
        >
          <input
            {...propsControl(`accion_vence_${sufijo}`, errores.vence_dia, false, "vence_dia")}
            type="date"
            min={hoy}
            defaultValue={valores.vence_dia}
          />
        </Campo>
      </div>
    </>
  );
}

/** Notas y día de cumplimiento de una acción completada (CA3). */
function CamposCumplimiento({
  sufijo,
  valores,
  errores,
  hoy,
}: {
  sufijo: string;
  valores: Record<string, string>;
  errores: Record<string, string>;
  hoy: string;
}) {
  return (
    <>
      <Campo
        id={`accion_notas_${sufijo}`}
        etiqueta="Notas de cumplimiento"
        error={errores.notas}
      >
        <textarea
          {...propsControl(`accion_notas_${sufijo}`, errores.notas, false, "notas")}
          rows={2}
          maxLength={LARGO_MAXIMO_NOTAS_ACCION}
          defaultValue={valores.notas}
        />
      </Campo>
      <Campo
        id={`accion_cumplida_${sufijo}`}
        etiqueta="Día en que se cumplió"
        error={errores.completado_dia}
        ayuda="No puede ser una fecha futura."
      >
        <input
          {...propsControl(
            `accion_cumplida_${sufijo}`,
            errores.completado_dia,
            true,
            "completado_dia",
          )}
          type="date"
          max={hoy}
          defaultValue={valores.completado_dia ?? hoy}
        />
      </Campo>
    </>
  );
}

// CA3: la acción pasa a En progreso, se completa con notas y el día en que se
// cumplió, o se cancela con un motivo.
export function FormularioAvanceAccion({
  casoId,
  accionId,
  version,
  estadoActual,
  hoy,
}: {
  casoId: string;
  accionId: string;
  version: string;
  estadoActual: string;
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    avanzarAccionPlan,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const [elegido, setElegido] = useState(valores.estado_nuevo ?? "");
  const sufijo = `avance_${accionId.slice(0, 8)}`;
  const opciones = [
    ...(estadoActual === "EN_PROGRESO"
      ? []
      : [{ valor: "EN_PROGRESO", texto: "En progreso" }]),
    { valor: "COMPLETADO", texto: "Completada" },
    { valor: "CANCELADO", texto: "Cancelada" },
  ];

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="accion_id" value={accionId} />
      <input type="hidden" name="version" value={version} />
      <ErrorGeneral estado={estado} />

      <Campo
        id={`accion_estado_${sufijo}`}
        etiqueta="Nuevo estado"
        error={errores.estado_nuevo}
      >
        <select
          {...propsControl(
            `accion_estado_${sufijo}`,
            errores.estado_nuevo,
            false,
            "estado_nuevo",
          )}
          value={elegido}
          onChange={(evento) => setElegido(evento.target.value)}
        >
          <option value="" disabled>
            Elige un estado
          </option>
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
      </Campo>

      {elegido === "COMPLETADO" && (
        <CamposCumplimiento
          sufijo={sufijo}
          valores={valores}
          errores={errores}
          hoy={hoy}
        />
      )}

      {elegido === "CANCELADO" && (
        <Campo
          id={`accion_motivo_${sufijo}`}
          etiqueta="Motivo de la cancelación"
          error={errores.motivo}
        >
          <textarea
            {...propsControl(`accion_motivo_${sufijo}`, errores.motivo, false, "motivo")}
            rows={2}
            maxLength={LARGO_MAXIMO_MOTIVO_PLAN}
            defaultValue={valores.motivo}
          />
        </Campo>
      )}

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Guardar avance"}
      </button>
    </form>
  );
}

// CA4: corregir una acción exige motivo; la auditoría conserva el valor
// anterior y el nuevo. Si ya está completada, también sus notas y su día.
export function FormularioCorreccionAccion({
  casoId,
  accion: actual,
  responsables,
  hoy,
}: {
  casoId: string;
  accion: {
    id: string;
    descripcion: string;
    persona_responsable_id: string;
    responsable: string;
    vence_dia: string;
    estado: string;
    notas: string | null;
    completado_dia: string | null;
    version: string;
  };
  responsables: Responsable[];
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    corregirAccionPlan,
    estadoInicial,
  );
  const errores = estado.errores ?? {};
  const valores = estado.valores ?? {
    descripcion: actual.descripcion,
    persona_responsable_id: actual.persona_responsable_id,
    vence_dia: actual.vence_dia,
    notas: actual.notas ?? "",
    completado_dia: actual.completado_dia ?? "",
  };
  const sufijo = `correccion_${actual.id.slice(0, 8)}`;
  // Si la persona responsable ya no tiene cuenta activa, se sigue mostrando
  // para poder corregir otro dato sin cambiarla.
  const opciones = responsables.some((p) => p.id === actual.persona_responsable_id)
    ? responsables
    : [
        { id: actual.persona_responsable_id, nombre: actual.responsable, perfiles: [] },
        ...responsables,
      ];

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="accion_id" value={actual.id} />
      <input type="hidden" name="version" value={actual.version} />
      <ErrorGeneral estado={estado} />

      <CamposAccion
        sufijo={sufijo}
        valores={valores}
        errores={errores}
        responsables={opciones}
        hoy={hoy}
      />
      {actual.estado === "COMPLETADO" && (
        <CamposCumplimiento
          sufijo={sufijo}
          valores={valores}
          errores={errores}
          hoy={hoy}
        />
      )}

      <Campo
        id={`accion_motivo_${sufijo}`}
        etiqueta="Motivo de la corrección"
        error={errores.motivo}
        ayuda="Queda en la auditoría con el valor anterior y el nuevo."
      >
        <textarea
          {...propsControl(`accion_motivo_${sufijo}`, errores.motivo, true, "motivo")}
          rows={2}
          maxLength={LARGO_MAXIMO_MOTIVO_PLAN}
          defaultValue={estado.valores?.motivo}
        />
      </Campo>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Guardar corrección"}
      </button>
    </form>
  );
}
