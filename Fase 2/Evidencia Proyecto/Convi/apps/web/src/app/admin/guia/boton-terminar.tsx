"use client";

import { FormularioConCarga } from "@/app/components/actividad";

import { useActionState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import { type EstadoGuia, terminarGuia } from "./acciones";

const estadoInicial: EstadoGuia = {};

// PB-039 (HU-032 CA2): termina la guía y abre el portal. La API guarda la
// fecha una sola vez.
export function BotonTerminarGuia({ version }: { version: string }) {
  const [estado, accion, pendiente] = useActionState(
    terminarGuia,
    estadoInicial,
  );
  return (
    <FormularioConCarga action={accion} className="space-y-3">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <input type="hidden" name="version" value={version} />
      <button
        type="submit"
        disabled={pendiente}
        className={claseBotonPrimario}
      >
        {pendiente ? "Terminando…" : "Terminar la guía e ir al portal"}
      </button>
    </FormularioConCarga>
  );
}
