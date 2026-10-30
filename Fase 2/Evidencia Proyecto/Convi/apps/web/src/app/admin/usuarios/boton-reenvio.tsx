"use client";

import { useActionState } from "react";
import { AvisoError, claseBotonSecundario } from "@/app/components/formulario";
import { reenviarCuenta, type EstadoReenvio } from "./acciones";

// PB-146 (HU-125): la clave cambia solo cuando la página se vuelve a cargar,
// así un reintento del mismo clic no manda un segundo correo.
export function BotonReenvio({
  cuentaId,
  solicitudId,
}: {
  cuentaId: string;
  solicitudId: string;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoReenvio>(
    reenviarCuenta.bind(null, cuentaId, solicitudId),
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
