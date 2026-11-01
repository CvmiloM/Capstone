"use client";

import { useActionState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import { type EstadoGuia, terminarPaso } from "./acciones";

const estadoInicial: EstadoGuia = {};

// PB-033 y PB-036: deja Listo un paso que se hace con una operación del
// portal (invitar al equipo o importar la nómina) cuando ya hay algo hecho;
// la API lo vuelve a comprobar.
export function BotonTerminarPaso({
  paso,
  version,
  habilitado,
}: {
  paso: "equipo" | "estudiantes";
  version: string;
  habilitado: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(
    terminarPaso.bind(null, paso),
    estadoInicial,
  );
  return (
    <form action={accion} className="space-y-3">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <input type="hidden" name="version" value={version} />
      <button
        type="submit"
        disabled={pendiente || !habilitado}
        className={claseBotonPrimario}
      >
        {pendiente ? "Guardando…" : "Marcar el paso como listo"}
      </button>
    </form>
  );
}
