import type { ReactNode } from "react";
import { claseBotonPrimario, claseBotonSecundario } from "@/app/components/formulario";
import { Icono, type NombreIcono } from "@/app/components/icono";

const claseResumen = "w-fit max-w-full cursor-pointer list-none text-left [&::-webkit-details-marker]:hidden";

export const claseAccionPrincipal = `${claseBotonPrimario} ${claseResumen}`;
export const claseAccionSecundaria = `${claseBotonSecundario} ${claseResumen}`;

export function EtiquetaAccion({ icono, children }: { icono: NombreIcono; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      {icono === "agregar" ? (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 in-[.bg-primary]:bg-primary-foreground/20">
          <Icono nombre={icono} className="size-4" />
        </span>
      ) : (
        <Icono nombre={icono} className="size-4 shrink-0" />
      )}
      <span>{children}</span>
    </span>
  );
}
