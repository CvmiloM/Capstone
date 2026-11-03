"use client";

import { FormularioConCarga } from "@/app/components/actividad";

import { useActionState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import { type EstadoGuia, terminarPaso } from "./acciones";
import type { PasoDelPortal } from "./opciones";

const estadoInicial: EstadoGuia = {};

// PB-033 y PB-035 a PB-037: deja Listo un paso que se hace con una operación
// del portal (invitar al equipo, subir el reglamento, importar la nómina o
// guardar una regla) cuando ya hay algo hecho; la API lo vuelve a comprobar.
export function BotonTerminarPaso({
  paso,
  version,
  habilitado,
}: {
  paso: PasoDelPortal;
  version: string;
  habilitado: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(
    terminarPaso.bind(null, paso),
    estadoInicial,
  );
  return (
    <FormularioConCarga action={accion} className="space-y-3">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <input type="hidden" name="version" value={version} />
      <button
        type="submit"
        disabled={pendiente || !habilitado}
        className={claseBotonPrimario}
      >
        {pendiente ? "Guardando…" : "Marcar el paso como listo"}
      </button>
    </FormularioConCarga>
  );
}
