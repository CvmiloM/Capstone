"use client";

import { useActionState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import { type EstadoGuia, terminarEstudiantes } from "./acciones";

const estadoInicial: EstadoGuia = {};

// PB-036 (HU-029): deja Listo el paso cuando ya hay estudiantes confirmados
// por importación; la API lo vuelve a comprobar.
export function BotonTerminarEstudiantes({
  version,
  habilitado,
}: {
  version: string;
  habilitado: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(
    terminarEstudiantes,
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
