"use client";

import { useActionState } from "react";
import {
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { cambiarEstadoCategoria, type EstadoFormulario } from "./acciones";
import type { EstadoCategoria } from "./opciones";

const estadoInicial: EstadoFormulario = {};

// Activa o desactiva una categoría. No pide confirmación porque se puede
// deshacer: desactivar solo la saca de las situaciones nuevas (CA2).
export function BotonEstado({
  id,
  estado: actual,
}: {
  id: string;
  estado: EstadoCategoria;
}) {
  const [estado, accion, pendiente] = useActionState(
    cambiarEstadoCategoria,
    estadoInicial,
  );
  const activa = actual === "ACTIVO";

  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <input
        type="hidden"
        name="estado"
        value={activa ? "INACTIVO" : "ACTIVO"}
      />
      <button
        type="submit"
        disabled={pendiente}
        className={activa ? claseBotonSecundario : claseBotonPrimario}
      >
        {pendiente ? "Guardando…" : activa ? "Desactivar" : "Activar"}
      </button>
      {estado.mensaje && (
        <p role="alert" className="mt-2 max-w-xs text-sm text-destructive">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}