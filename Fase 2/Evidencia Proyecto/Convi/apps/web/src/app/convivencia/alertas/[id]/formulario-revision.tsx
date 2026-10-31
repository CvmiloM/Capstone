"use client";

import { useActionState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import type { EstadoAccion } from "../../casos/[id]/acciones";
import { Campo, propsControl } from "../../casos/[id]/formularios";
import { revisarAlerta } from "../acciones";
import {
  LARGO_MAXIMO_OBSERVACION_ALERTA,
  OPCIONES_REVISION,
} from "../opciones";

// PB-093 (HU-080 CA2 y CA3): se marca una sola vez, desde Nueva, como
// Revisada o Archivada; lo escrito no se puede cambiar después.
const estadoInicial: EstadoAccion = {};

export function FormularioRevision({
  alertaId,
  version,
}: {
  alertaId: string;
  version: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    revisarAlerta,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="alerta_id" value={alertaId} />
      <input type="hidden" name="version" value={version} />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <fieldset
        aria-describedby={errores.estado_nuevo ? "estado_nuevo-error" : undefined}
      >
        <legend className="text-sm font-medium">¿Cómo queda la alerta?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {OPCIONES_REVISION.map((opcion) => (
            <label
              key={opcion.valor}
              className="flex cursor-pointer gap-3 rounded-xl border border-input bg-card p-3 has-[:checked]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name="estado_nuevo"
                value={opcion.valor}
                defaultChecked={valores.estado_nuevo === opcion.valor}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">{opcion.texto}</span>
                <span className="block text-sm text-muted-foreground">
                  {opcion.ayuda}
                </span>
              </span>
            </label>
          ))}
        </div>
        {errores.estado_nuevo && (
          <p id="estado_nuevo-error" className="mt-1.5 text-sm text-destructive">
            {errores.estado_nuevo}
          </p>
        )}
      </fieldset>

      <Campo
        id="observacion"
        etiqueta="Qué se hizo"
        error={errores.observacion}
        ayuda="Queda con tu nombre y la fecha, y no se puede cambiar después."
      >
        <textarea
          {...propsControl("observacion", errores.observacion, true)}
          rows={4}
          maxLength={LARGO_MAXIMO_OBSERVACION_ALERTA}
          defaultValue={valores.observacion}
        />
      </Campo>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Guardar revisión"}
      </button>
    </form>
  );
}
