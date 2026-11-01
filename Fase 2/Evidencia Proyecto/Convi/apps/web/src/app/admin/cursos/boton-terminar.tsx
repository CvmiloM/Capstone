"use client";

import { useActionState } from "react";
import { ConfirmarEnvio } from "@/app/components/confirmar-envio";
import { claseBotonSecundario } from "@/app/components/formulario";
import { type EstadoFormulario, terminarAsignacion } from "./acciones";
import { CampoMotivo } from "./campo-motivo";

const estadoInicial: EstadoFormulario = {};

// HU-013 CA4: registra el último día de una asignación. Como no se puede
// reabrir, pide confirmación antes de enviar. PB-023 (HU-018 CA1): en un año
// Cerrado corrige el término, hacia antes o hacia después, con un motivo.
export function BotonTerminar({
  asignacionId,
  profesor,
  desde,
  hasta,
  hoy,
  anioCerrado,
}: {
  asignacionId: string;
  profesor: string;
  /** Inicio de la asignación: el último día no puede ser anterior. */
  desde: string | null;
  /** Término ya registrado: el último día no puede ser posterior. */
  hasta: string | null;
  hoy: string;
  /** PB-023: año Cerrado del curso, el cambio es una corrección con motivo. */
  anioCerrado?: number;
}) {
  const [estado, accion, pendiente] = useActionState(
    terminarAsignacion,
    estadoInicial,
  );
  const correccion = anioCerrado !== undefined;
  // Por defecto, hoy, dentro de los límites de la asignación. Al corregir,
  // el término que ya tiene.
  const sugerida = correccion
    ? (hasta ?? hoy)
    : hasta && hasta < hoy
      ? hasta
      : desde && desde > hoy
        ? desde
        : hoy;
  const porDefecto = estado.valores?.fecha_fin ?? sugerida;

  return (
    <ConfirmarEnvio
      mensaje={
        correccion
          ? `¿Corregir el término de la asignación de ${profesor}? El cambio y su motivo quedarán en auditoría`
          : `¿Terminar la asignación de ${profesor}? Se conservará su participación histórica y se aplicará la fecha que elegiste`
      }
    >
      <form
        action={accion}
        className={
          correccion
            ? "space-y-3"
            : "flex flex-wrap items-center justify-end gap-2"
        }
      >
        <input type="hidden" name="asignacion_id" value={asignacionId} />
        <label
          className={correccion ? "block text-sm font-medium" : "sr-only"}
          htmlFor={`fin-${asignacionId}`}
        >
          Último día de {profesor}
        </label>
        <input
          id={`fin-${asignacionId}`}
          name="fecha_fin"
          type="date"
          defaultValue={porDefecto}
          min={desde ?? undefined}
          max={correccion ? undefined : (hasta ?? undefined)}
          className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15"
        />
        {correccion && (
          <CampoMotivo
            id={`motivo-fin-${asignacionId}`}
            anio={anioCerrado}
            defaultValue={estado.valores?.motivo}
          />
        )}
        <button
          type="submit"
          disabled={pendiente}
          className={claseBotonSecundario}
        >
          {pendiente
            ? correccion
              ? "Corrigiendo…"
              : "Terminando…"
            : correccion
              ? "Corregir término"
              : "Terminar"}
        </button>
        {estado.mensaje && (
          <p
            role="alert"
            className={`w-full text-sm text-destructive ${correccion ? "" : "text-right"}`}
          >
            {estado.mensaje}
          </p>
        )}
      </form>
    </ConfirmarEnvio>
  );
}
