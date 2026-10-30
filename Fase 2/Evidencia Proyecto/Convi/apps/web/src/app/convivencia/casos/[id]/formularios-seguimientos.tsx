"use client";

import { useActionState, useId, useState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import { SelectorFiltro } from "@/app/components/selector-filtro";
import type { Compromiso, DetalleCaso, Seguimiento } from "../datos";
import type { EstadoAccion } from "./acciones";
import { ESTADOS_CUMPLIMIENTO } from "./opciones";
import { guardarSeguimiento } from "./acciones-seguimientos";
import { Campo, propsControl } from "./formularios";

function Eleccion({
  nombre,
  etiqueta,
  opciones,
  inicial = "",
}: {
  nombre: string;
  etiqueta: string;
  opciones: [string, string][];
  inicial?: string;
}) {
  const [valor, cambiar] = useState(inicial);
  return (
    <SelectorFiltro
      nombre={nombre}
      etiqueta={etiqueta}
      opciones={opciones}
      valor={valor}
      cambiar={cambiar}
    />
  );
}

export function FormularioSeguimiento({
  caso,
  modo,
  seguimiento,
  compromiso,
}: {
  caso: DetalleCaso;
  modo:
    "compromiso" | "programar" | "resultado" | "reprogramacion" | "revisiones";
  seguimiento?: Seguimiento;
  compromiso?: Compromiso;
}) {
  const [estado, accion, pendiente] = useActionState(
    guardarSeguimiento,
    {} as EstadoAccion,
  );
  const [otro, cambiarOtro] = useState(false);
  const id = useId(),
    valores = estado.valores ?? {},
    errores = estado.errores ?? {};
  function campo(
    nombre: string,
    etiqueta: string,
    tipo = "text",
    inicial = "",
    max = 2000,
  ) {
    const control = propsControl(
      `${id}-${nombre}`,
      errores[nombre],
      false,
      nombre,
    );
    return (
      <Campo id={`${id}-${nombre}`} etiqueta={etiqueta} error={errores[nombre]}>
        {tipo === "textarea" ? (
          <textarea
            {...control}
            rows={3}
            maxLength={max}
            defaultValue={valores[nombre] ?? inicial}
          />
        ) : (
          <input
            {...control}
            type={tipo}
            maxLength={max}
            defaultValue={valores[nombre] ?? inicial}
            max={nombre === "realizado_en" ? caso.ahora : undefined}
          />
        )}
      </Campo>
    );
  }
  const personas = [
    ...new Map(
      caso.opciones_encuentro.asistentes.map((p) => [p.persona_id, p]),
    ).values(),
  ];
  const responsables: [string, string][] = [
    ["", "Elige responsable"],
    ...caso.opciones_encuentro.responsables.map(
      (p) => [p.id, p.nombre] as [string, string],
    ),
  ];
  const nuevosCampos = (
    <>
      {campo(
        "objetivo",
        otro
          ? "Objetivo del siguiente seguimiento"
          : "Objetivo del seguimiento",
        "textarea",
        "",
        1000,
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {campo("programado_en", "Fecha y hora programadas", "datetime-local")}
        <Eleccion
          nombre="responsable_id"
          etiqueta="Profesional de Convivencia responsable"
          opciones={responsables}
          inicial={valores.responsable_id}
        />
      </div>
    </>
  );
  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={caso.id} />
      <input type="hidden" name="modo" value={modo} />
      {seguimiento && (
        <>
          <input type="hidden" name="seguimiento_id" value={seguimiento.id} />
          <input type="hidden" name="version" value={seguimiento.version} />
        </>
      )}
      {compromiso && (
        <>
          <input type="hidden" name="compromiso_id" value={compromiso.id} />
          <input
            type="hidden"
            name="version_compromiso"
            value={compromiso.version}
          />
        </>
      )}
      <div aria-live="polite">
        {estado.mensaje && (
          <AvisoError>
            {estado.mensaje}
            {estado.errores && (
              <ul className="mt-2 list-inside list-disc">
                {[...new Set(Object.values(estado.errores))].map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </AvisoError>
        )}
      </div>
      {modo === "compromiso" && (
        <>
          {campo("descripcion", "¿Qué se acordó?", "textarea")}
          <div className="grid gap-4 sm:grid-cols-2">
            <Eleccion
              nombre="persona_responsable_id"
              etiqueta="Persona que asume el compromiso"
              opciones={[
                ["", "Elige una persona"],
                ...personas.map(
                  (p) => [p.persona_id, p.nombre] as [string, string],
                ),
              ]}
              inicial={valores.persona_responsable_id}
            />
            {campo(
              "vence_en",
              "Fecha y hora de cumplimiento",
              "datetime-local",
            )}
          </div>
          <Eleccion
            nombre="actuacion_origen_id"
            etiqueta="¿Dónde se acordó? (opcional)"
            opciones={[
              ["", "Sin actuación de origen"],
              ...caso.actuaciones_origen.map(
                (a) => [a.id, a.objetivo] as [string, string],
              ),
            ]}
            inicial={valores.actuacion_origen_id}
          />
          <p className="text-sm text-muted-foreground">
            Comienza pendiente, podrás revisar su cumplimiento al registrar un
            seguimiento
          </p>
        </>
      )}
      {modo === "programar" && nuevosCampos}
      {modo === "reprogramacion" && (
        <>
          {campo(
            "programado_en",
            "Nueva fecha y hora",
            "datetime-local",
            seguimiento?.programado_local,
          )}
          {campo("motivo", "Motivo de la reprogramación", "textarea", "", 1000)}
          <p className="text-sm text-muted-foreground">
            La fecha anterior quedará en el historial y la agenda mostrará la
            nueva
          </p>
        </>
      )}
      {modo === "resultado" && (
        <>
          {campo("realizado_en", "¿Cuándo se realizó?", "datetime-local")}
          {campo("resultado", "Resultado y hallazgos", "textarea", "", 4000)}
          {campo("proxima_accion", "¿Qué se hará después?", "textarea")}
          <fieldset className="space-y-3">
            <legend className="mb-2 font-medium">
              Compromisos que revisaste
            </legend>
            <p className="text-sm text-muted-foreground">
              Elige el estado observado y explica lo que ocurrió, puedes dejar
              sin revisar los que no se trataron
            </p>
            {caso.compromisos.map((c) => (
              <details
                key={c.id}
                className="rounded-xl border border-border p-3"
              >
                <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                  {c.descripcion}
                </summary>
                <div className="mt-3 space-y-3">
                  <input
                    type="hidden"
                    name={`version_${c.id}`}
                    value={c.version}
                  />
                  <Eleccion
                    nombre={`estado_${c.id}`}
                    etiqueta="Cumplimiento observado"
                    opciones={[
                      ["", "No revisar en este seguimiento"],
                      ...ESTADOS_CUMPLIMIENTO,
                    ]}
                    inicial={valores[`estado_${c.id}`]}
                  />
                  {campo(`observacion_${c.id}`, "¿Qué observaste?", "textarea")}
                </div>
              </details>
            ))}
            {caso.compromisos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Este caso todavía no tiene compromisos
              </p>
            )}
          </fieldset>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="otro"
              checked={otro}
              onChange={(e) => cambiarOtro(e.target.checked)}
            />
            Programar otro seguimiento al guardar
          </label>
          {otro && (
            <div className="space-y-4 rounded-xl bg-muted/50 p-4">
              {nuevosCampos}
            </div>
          )}
        </>
      )}
      {modo === "revisiones" && (
        <>
          <Eleccion
            nombre="estado_observado"
            etiqueta="Cumplimiento observado"
            opciones={[["", "Elige el estado"], ...ESTADOS_CUMPLIMIENTO]}
            inicial={valores.estado_observado}
          />
          {campo("observacion", "¿Qué observaste?", "textarea")}
        </>
      )}
      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente
          ? "Guardando…"
          : modo === "compromiso"
            ? "Registrar compromiso"
            : modo === "programar"
              ? "Programar seguimiento"
              : modo === "resultado"
                ? "Guardar resultado"
                : modo === "reprogramacion"
                  ? "Guardar nueva fecha"
                  : "Guardar revisión"}
      </button>
    </form>
  );
}
