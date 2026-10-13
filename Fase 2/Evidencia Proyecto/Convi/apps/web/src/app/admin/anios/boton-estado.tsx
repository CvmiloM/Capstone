"use client";

import { useActionState } from "react";
import {
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { cambiarEstadoAnio, type EstadoCambio } from "./acciones";

const estadoInicial: EstadoCambio = {};

const TEXTOS = {
  ACTIVO: {
    boton: "Activar",
    pendiente: "Activando…",
    confirmar: (anio: number) =>
      `¿Activar el año ${anio}? Pasará a ser el año vigente de la escuela y no podrá volver a Planificado.`,
  },
  CERRADO: {
    boton: "Cerrar año",
    pendiente: "Cerrando…",
    confirmar: (anio: number) =>
      `¿Cerrar el año ${anio}? Un año cerrado no vuelve a abrirse ni se puede editar.`,
  },
};

// Activa o cierra un año, siempre un paso hacia adelante. Como no se puede
// deshacer, pide confirmación antes de enviar.
export function BotonEstado({
  id,
  anio,
  destino,
}: {
  id: string;
  anio: number;
  destino: "ACTIVO" | "CERRADO";
}) {
  const [estado, accion, pendiente] = useActionState(
    cambiarEstadoAnio,
    estadoInicial,
  );
  const textos = TEXTOS[destino];

  return (
    <form
      action={accion}
      onSubmit={(evento) => {
        if (!window.confirm(textos.confirmar(anio))) evento.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={destino} />
      <button
        type="submit"
        disabled={pendiente}
        className={
          destino === "ACTIVO" ? claseBotonPrimario : claseBotonSecundario
        }
      >
        {pendiente ? textos.pendiente : textos.boton}
      </button>
      {estado.mensaje && (
        <p role="alert" className="mt-2 max-w-xs text-sm text-destructive">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}