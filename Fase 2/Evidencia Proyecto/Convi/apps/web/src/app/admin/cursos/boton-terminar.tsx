"use client";

import { useActionState } from "react";
import { claseBotonSecundario } from "@/app/components/formulario";
import { type EstadoFormulario, terminarAsignacion } from "./acciones";

const estadoInicial: EstadoFormulario = {};

// HU-013 CA4: registra el último día de una asignación. Como no se puede
// reabrir, pide confirmación antes de enviar.
export function BotonTerminar({
  asignacionId,
  profesor,
  desde,
  hasta,
  hoy,
}: {
  asignacionId: string;
  profesor: string;
  /** Inicio de la asignación: el último día no puede ser anterior. */
  desde: string | null;
  /** Término ya registrado: el último día no puede ser posterior. */
  hasta: string | null;
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    terminarAsignacion,
    estadoInicial,
  );
  // Por defecto, hoy, dentro de los límites de la asignación.
  const sugerida =
    hasta && hasta < hoy ? hasta : desde && desde > hoy ? desde : hoy;
  const porDefecto = estado.valores?.fecha_fin ?? sugerida;

  return (
    <form
      action={accion}
      onSubmit={(evento) => {
        const fecha = new FormData(evento.currentTarget).get("fecha_fin");
        if (
          !window.confirm(
            `¿Terminar la asignación de ${profesor} con último día ${fecha}? Después de ese día no podrá registrar situaciones de este curso, y no se puede reabrir.`,
          )
        )
          evento.preventDefault();
      }}
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <input type="hidden" name="asignacion_id" value={asignacionId} />
      <label className="sr-only" htmlFor={`fin-${asignacionId}`}>
        Último día de {profesor}
      </label>
      <input
        id={`fin-${asignacionId}`}
        name="fecha_fin"
        type="date"
        defaultValue={porDefecto}
        min={desde ?? undefined}
        max={hasta ?? undefined}
        className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15"
      />
      <button
        type="submit"
        disabled={pendiente}
        className={claseBotonSecundario}
      >
        {pendiente ? "Terminando…" : "Terminar"}
      </button>
      {estado.mensaje && (
        <p role="alert" className="w-full text-right text-sm text-destructive">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}