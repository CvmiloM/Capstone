"use client";

import { useActionState } from "react";
import { ConfirmarEnvio } from "@/app/components/confirmar-envio";
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
      `¿Cerrar el año ${anio}? El año no volverá a abrirse, sus registros se conservarán y las correcciones posteriores requerirán un motivo`,
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
    <ConfirmarEnvio mensaje={textos.confirmar(anio)}>
      <form action={accion}>
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
    </ConfirmarEnvio>
  );
}
