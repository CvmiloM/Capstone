"use client";

import { EtiquetaAccion } from "./etiqueta-accion";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { claseBotonPrimario, claseBotonSecundario } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";

export function AccionesComunicacion({
  acciones,
  inicial,
}: {
  acciones: {
    clave: string;
    titulo: string;
    icono?: ComponentProps<typeof Icono>["nombre"];
    principal?: boolean;
    formulario: ReactNode;
  }[];
  inicial?: string;
}) {
  const [activa, cambiar] = useState(inicial);
  const base = useId();

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {acciones.map(({ clave, titulo, icono, principal }) => (
          <button
            key={clave}
            type="button"
            aria-expanded={activa === clave}
            aria-controls={base + clave}
            className={`gap-2 ${principal ? claseBotonPrimario : claseBotonSecundario}`}
            onClick={() => cambiar((actual) => actual === clave ? undefined : clave)}
          >
            <EtiquetaAccion icono={activa === clave ? "cerrar" : icono ?? "agregar"}>
              {activa === clave ? "Cerrar formulario" : titulo}
            </EtiquetaAccion>
          </button>
        ))}
      </div>
      {acciones.map(({ clave, formulario }) => (
        <div key={clave} id={base + clave} hidden={activa !== clave} className="mt-3 rounded-xl border border-border bg-card p-4">
          {formulario}
        </div>
      ))}
    </div>
  );
}
