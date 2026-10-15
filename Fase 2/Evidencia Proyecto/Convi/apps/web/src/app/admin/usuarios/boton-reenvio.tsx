"use client";

import { useActionState } from "react";
import { AvisoError, claseBotonSecundario } from "@/app/components/formulario";
import { reenviarCuenta, type EstadoReenvio } from "./acciones";

export function BotonReenvio({ cuentaId }: { cuentaId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoReenvio>(
    reenviarCuenta.bind(null, cuentaId),
    {},
  );

  return (
    <form action={accion} className="flex max-w-xs flex-col gap-2">
      <button
        type="submit"
        disabled={pendiente}
        aria-label={pendiente ? "Reenviando invitación" : "Reenviar invitación"}
        className={`${claseBotonSecundario} w-24 shrink-0 px-3! py-2! text-xs! disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {pendiente ? (
          "Reenviando…"
        ) : (
          <span>
            <span className="block">Reenviar</span>
            <span className="block">invitación</span>
          </span>
        )}
      </button>
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      {estado.reenviado && (
        <p role="status" className="text-sm text-primary">
          Invitación reenviada al mismo correo.
        </p>
      )}
    </form>
  );
}
