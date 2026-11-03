"use client";

import { FormularioConCarga } from "@/app/components/actividad";

import { useActionState } from "react";
import { cerrarSesion } from "./cerrar-sesion";
import { AvisoError, claseBotonSecundario } from "./formulario";

export function BotonCerrarSesion() {
  const [error, accion, pendiente] = useActionState<string | null>(
    cerrarSesion,
    null,
  );

  return (
    <FormularioConCarga action={accion} className="flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={pendiente}
        className={`${claseBotonSecundario} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {pendiente ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
      {error && <AvisoError>{error}</AvisoError>}
    </FormularioConCarga>
  );
}
