"use client";

import { useId, useRef, type ReactNode } from "react";
import { claseBotonPrimario, claseBotonSecundario } from "./formulario";

/** Conserva la acción y el botón original del formulario después de confirmar. */
export function ConfirmarEnvio({
  mensaje,
  children,
}: {
  mensaje?: string;
  children: ReactNode;
}) {
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const envio = useRef<{
    formulario: HTMLFormElement;
    boton: HTMLElement | null;
  } | null>(null);
  const confirmado = useRef(false);
  return (
    <div
      onSubmitCapture={(evento) => {
        if (
          !mensaje ||
          confirmado.current ||
          !(evento.target instanceof HTMLFormElement)
        )
          return;
        evento.preventDefault();
        evento.stopPropagation();
        envio.current = {
          formulario: evento.target,
          boton: (evento.nativeEvent as SubmitEvent).submitter,
        };
        dialogo.current?.showModal();
      }}
    >
      {children}
      <dialog
        ref={dialogo}
        aria-labelledby={id}
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-foreground/35"
      >
        <h2 id={id} className="font-titulo text-xl font-semibold">
          Confirma la acción
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {mensaje}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className={claseBotonSecundario}
            onClick={() => dialogo.current?.close()}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={claseBotonPrimario}
            onClick={() => {
              dialogo.current?.close();
              const actual = envio.current;
              if (!actual?.formulario.isConnected) return;
              confirmado.current = true;
              try {
                actual.formulario.requestSubmit(actual.boton);
              } finally {
                confirmado.current = false;
              }
            }}
          >
            Confirmar
          </button>
        </div>
      </dialog>
    </div>
  );
}
