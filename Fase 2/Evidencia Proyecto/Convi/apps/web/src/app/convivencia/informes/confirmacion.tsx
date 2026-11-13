"use client";

import { useEffect, useRef } from "react";

export function ConfirmacionInforme({ publicado }: { publicado: boolean }) {
  const mensaje = useRef<HTMLDivElement>(null);
  useEffect(() => { mensaje.current?.focus(); }, []);
  return <div id="resultado" ref={mensaje} tabIndex={-1} role="status" className="scroll-mt-24 rounded-xl border border-verde/30 bg-verde/10 p-4 text-sm focus-visible:outline-2 focus-visible:outline-ring">
    {publicado ? "Publicaste el informe. Sus archivos y criterios quedaron conservados; puedes abrir el PDF o descargar el Excel." : "Guardaste los cambios del borrador. Revisa el resultado y sus archivos antes de publicarlo."}
  </div>;
}
