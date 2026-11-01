"use client";

import { useActionState } from "react";
import { ConfirmarEnvio } from "@/app/components/confirmar-envio";
import {
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { cambiarRegla, type EstadoFormulario } from "./acciones";

const estadoInicial: EstadoFormulario = {};

/**
 * PB-089 (HU-078 CA6): crear una versión nueva, activar o archivar una regla.
 * Activar y archivar piden confirmación porque no se deshacen: una regla
 * archivada no se vuelve a activar.
 */
export function BotonRegla({
  portal,
  id,
  accion: tipoAccion,
  texto,
  textoPendiente,
  confirmar,
  principal = false,
}: {
  portal: "admin" | "convivencia";
  id: string;
  accion: "version" | "activar" | "archivar";
  texto: string;
  textoPendiente: string;
  confirmar?: string;
  principal?: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(
    cambiarRegla,
    estadoInicial,
  );

  return (
    <ConfirmarEnvio mensaje={confirmar}>
      <form action={accion}>
        <input type="hidden" name="portal" value={portal} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="accion" value={tipoAccion} />
        <button
          type="submit"
          disabled={pendiente}
          className={principal ? claseBotonPrimario : claseBotonSecundario}
        >
          {pendiente ? textoPendiente : texto}
        </button>
        {estado.mensaje && (
          <p role="alert" className="mt-2 max-w-sm text-sm text-destructive">
            {estado.mensaje}
          </p>
        )}
      </form>
    </ConfirmarEnvio>
  );
}
