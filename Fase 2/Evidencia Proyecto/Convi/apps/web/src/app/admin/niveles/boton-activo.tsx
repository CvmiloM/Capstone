"use client";

import { useActionState } from "react";
import {
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { cambiarActivoNivel, type EstadoActivo } from "./acciones";

const estadoInicial: EstadoActivo = {};

// Activa o desactiva un nivel. No pide confirmación porque se puede deshacer:
// desactivar solo lo saca de los cursos nuevos (CA2).
export function BotonActivo({ id, activo }: { id: string; activo: boolean }) {
  const [estado, accion, pendiente] = useActionState(
    cambiarActivoNivel,
    estadoInicial,
  );

  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activo" value={activo ? "false" : "true"} />
      <button
        type="submit"
        disabled={pendiente}
        className={activo ? claseBotonSecundario : claseBotonPrimario}
      >
        {pendiente ? "Guardando…" : activo ? "Desactivar" : "Activar"}
      </button>
      {estado.mensaje && (
        <p role="alert" className="mt-2 max-w-xs text-sm text-destructive">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}