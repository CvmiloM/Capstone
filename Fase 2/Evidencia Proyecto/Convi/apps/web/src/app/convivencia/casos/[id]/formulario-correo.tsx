"use client";

import { useActionState, useState } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import type { CorreoCaso, DestinatarioCorreo } from "../datos";
import type { EstadoAccion } from "./acciones";
import { descartarCorreo, guardarCorreo } from "./acciones-correos";
import { Campo, propsControl } from "./formularios";
import {
  LARGO_MAXIMO_ASUNTO,
  LARGO_MAXIMO_CONTENIDO,
  LARGO_MAXIMO_DIRECCION,
  NOMBRE_ROL_ASISTENTE,
} from "./opciones";

// PB-151 (HU-130): borrador de correo redactado a mano, o edición de uno ya
// guardado, también si lo preparó la IA (HU-075 CA2). Guardar no envía nada.
const estadoInicial: EstadoAccion = {};
const ROLES = ["APODERADO", "ESTUDIANTE", "EQUIPO"];

export function FormularioCorreo({
  casoId,
  destinatarios,
  correo,
}: {
  casoId: string;
  destinatarios: DestinatarioCorreo[];
  /** Si viene, se edita ese borrador. */
  correo?: CorreoCaso;
}) {
  const [estado, accion, pendiente] = useActionState(
    guardarCorreo,
    estadoInicial,
  );
  const valores = estado.valores;
  const errores = estado.errores ?? {};
  const id = correo ? `correo_${correo.id}` : "correo_nuevo";
  const [elegido, setElegido] = useState(
    valores?.persona_destinataria_id ?? correo?.persona_destinataria_id ?? "",
  );
  const persona = destinatarios.find((d) => d.persona_id === elegido);
  // La dirección guardada manda; si no, la de la ficha de la persona elegida.
  const [direccion, setDireccion] = useState(
    valores?.direccion ?? correo?.direccion ?? "",
  );

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      {correo && <input type="hidden" name="correo_id" value={correo.id} />}
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id={`${id}_persona`}
          etiqueta="Destinatario"
          error={errores.persona_destinataria_id}
        >
          <select
            {...propsControl(
              `${id}_persona`,
              errores.persona_destinataria_id,
              false,
              "persona_destinataria_id",
            )}
            value={elegido}
            onChange={(evento) => {
              setElegido(evento.target.value);
              const nueva = destinatarios.find(
                (d) => d.persona_id === evento.target.value,
              );
              setDireccion(nueva?.correo ?? "");
            }}
          >
            <option value="">Solo escribir la dirección</option>
            {ROLES.map((rol) => {
              const grupo = destinatarios.filter((d) => d.rol === rol);
              return grupo.length === 0 ? null : (
                <optgroup key={rol} label={NOMBRE_ROL_ASISTENTE[rol] ?? rol}>
                  {grupo.map((d) => (
                    <option key={`${rol}-${d.persona_id}`} value={d.persona_id}>
                      {d.nombre}
                      {d.detalle ? ` (${d.detalle})` : ""}
                      {d.no_contactable
                        ? " · no contactable según su vínculo"
                        : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </Campo>
        <Campo
          id={`${id}_direccion`}
          etiqueta="Correo del destinatario"
          error={errores.direccion}
          ayuda={
            persona && !persona.correo
              ? "Esta persona no tiene correo en su ficha, escríbelo aquí."
              : "Se completa con el correo de la ficha y puedes cambiarlo."
          }
        >
          <input
            {...propsControl(
              `${id}_direccion`,
              errores.direccion,
              true,
              "direccion",
            )}
            type="email"
            maxLength={LARGO_MAXIMO_DIRECCION}
            value={direccion}
            onChange={(evento) => setDireccion(evento.target.value)}
          />
        </Campo>
      </div>

      {persona?.no_contactable && (
        <div
          role="alert"
          className="rounded-lg border border-naranjo/40 bg-naranjo/10 px-4 py-3 text-sm"
        >
          El vínculo indica que este apoderado no puede ser contactado, puedes
          preparar el borrador igual: al confirmar el envío se avisará de nuevo
          y la advertencia quedará en la auditoría.
        </div>
      )}

      <Campo id={`${id}_asunto`} etiqueta="Asunto" error={errores.asunto}>
        <input
          {...propsControl(`${id}_asunto`, errores.asunto, false, "asunto")}
          type="text"
          maxLength={LARGO_MAXIMO_ASUNTO}
          defaultValue={valores?.asunto ?? correo?.asunto ?? ""}
        />
      </Campo>

      <Campo
        id={`${id}_contenido`}
        etiqueta="Contenido"
        error={errores.contenido}
      >
        <textarea
          {...propsControl(
            `${id}_contenido`,
            errores.contenido,
            false,
            "contenido",
          )}
          rows={10}
          maxLength={LARGO_MAXIMO_CONTENIDO}
          defaultValue={valores?.contenido ?? correo?.contenido ?? ""}
        />
      </Campo>

      <p className="text-sm text-muted-foreground">
        Guardar no envía el correo: queda como borrador del caso hasta que un
        profesional de Convivencia lo confirme.
      </p>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente
          ? "Guardando…"
          : correo
            ? "Guardar cambios"
            : "Guardar borrador"}
      </button>
    </form>
  );
}

// Decisión del PO (2026-10-31): un borrador que nadie confirmó se puede descartar.
export function BotonDescartarCorreo({
  casoId,
  correoId,
}: {
  casoId: string;
  correoId: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    descartarCorreo,
    estadoInicial,
  );
  return (
    <form
      action={accion}
      onSubmit={(evento) => {
        if (!window.confirm("¿Descartar este borrador? No se puede recuperar."))
          evento.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="correo_id" value={correoId} />
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <button
        type="submit"
        disabled={pendiente}
        className={claseBotonSecundario}
      >
        {pendiente ? "Descartando…" : "Descartar borrador"}
      </button>
    </form>
  );
}
