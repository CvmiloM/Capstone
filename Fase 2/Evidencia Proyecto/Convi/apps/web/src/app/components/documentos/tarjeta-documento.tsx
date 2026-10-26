"use client";

import { useId, useState, type ReactNode } from "react";

export function TarjetaDocumento({
  nombre,
  children,
  preparacion,
  acciones,
}: {
  nombre: string;
  children: ReactNode;
  preparacion: ReactNode;
  acciones: ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  const opcionesId = useId();
  return (
    <article className="relative isolate rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
      <button
        type="button"
        aria-label={`${abierta ? "Ocultar" : "Mostrar"} opciones de ${nombre}`}
        aria-expanded={abierta}
        aria-controls={opcionesId}
        onClick={() => setAbierta((valor) => !valor)}
        className="absolute inset-0 z-0 h-full w-full cursor-pointer rounded-2xl transition-colors hover:bg-primary/[0.025] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <div className="pointer-events-none relative z-10">{children}</div>
      <div className="pointer-events-none relative z-10 mt-4">
        {preparacion}
      </div>
      <div
        id={opcionesId}
        hidden={!abierta}
        className="relative z-10 mt-4 border-t border-border pt-4"
      >
        {acciones}
      </div>
    </article>
  );
}
