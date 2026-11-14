"use client";

import { useActionState } from "react";
import { FormularioConCarga } from "@/app/components/actividad";
import { AvisoError, claseBotonSecundario } from "@/app/components/formulario";
import { tomarSituacion, type EstadoToma } from "./acciones";

const estadoInicial: EstadoToma = {};

// Bandeja: botón para quedar como responsable de una situación abierta que
// nadie revisa. Si otra persona la tomó antes, se muestra el aviso de la API.
export function BotonTomar({
  situacionId,
  codigo,
  volver,
}: {
  situacionId: string;
  codigo: string;
  /** La bandeja con los filtros actuales, para volver a la misma página. */
  volver: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    tomarSituacion,
    estadoInicial,
  );
  return (
    <FormularioConCarga
      action={accion}
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <input type="hidden" name="situacion_id" value={situacionId} />
      <input type="hidden" name="codigo" value={codigo} />
      <input type="hidden" name="volver" value={volver} />
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <button
        type="submit"
        disabled={pendiente}
        className={claseBotonSecundario}
      >
        {pendiente ? "Tomando…" : "Tomar"}
        <span className="sr-only"> la situación {codigo}</span>
      </button>
    </FormularioConCarga>
  );
}
