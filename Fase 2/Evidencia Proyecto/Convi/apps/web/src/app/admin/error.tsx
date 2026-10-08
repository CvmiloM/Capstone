"use client";

import { claseBotonPrimario } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";

// Se muestra si una página del portal falla al cargar (HU-033 CA4). En Next 16
// la función para volver a intentar se llama retry (antes era reset).
export default function ErrorAdmin({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto mt-8 max-w-lg rounded-2xl border border-destructive/20 bg-card p-8 text-center shadow-tarjeta"
    >
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icono nombre="alerta" className="size-6" />
      </span>
      <h2 className="mt-4 text-xl font-semibold">No pudimos cargar esta sección</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Puede ser un problema de conexión con el servidor. Vuelve a intentarlo
        en unos segundos.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Código del error: {error.digest}
        </p>
      )}
      <button type="button" onClick={() => retry()} className={`mt-6 ${claseBotonPrimario}`}>
        Reintentar
      </button>
    </div>
  );
}