"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { enfocarPaso } from "./foco-error";

/**
 * PB-136 (HU-116): para formularios que cambian de paso sin recargar, como el
 * segundo factor. Cada vez que cambia `clave` (la respuesta del servidor), el
 * foco va al primer error o al título del paso nuevo, en vez de perderse
 * cuando el botón presionado desaparece o queda desactivado.
 */
export function PasoConFoco({
  clave,
  children,
}: {
  clave: unknown;
  children: ReactNode;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    enfocarPaso(contenedor.current);
  }, [clave]);
  return <div ref={contenedor}>{children}</div>;
}
