"use client";

import { useActionState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import { responderAclaracion, type EstadoRespuesta } from "./acciones";

const estadoInicial: EstadoRespuesta = {};

// Mismo límite que valida la API (respuesta-aclaracion.ts).
const LARGO_MAXIMO_RESPUESTA = 4000;

// PB-049 (HU-042): respuesta del profesor a una aclaración pendiente. La API
// vuelve a validar todo; aquí solo se muestran sus mensajes.
export function FormularioRespuesta({
  aclaracionId,
  situacionId,
}: {
  aclaracionId: string;
  situacionId: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    responderAclaracion,
    estadoInicial,
  );
  const campo = `respuesta-${aclaracionId}`;

  return (
    <form action={accion} noValidate className="mt-3 space-y-3">
      <input type="hidden" name="aclaracion_id" value={aclaracionId} />
      <input type="hidden" name="situacion_id" value={situacionId} />
      {estado.mensaje && !estado.error && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <div>
        <label htmlFor={campo} className="block text-sm font-medium">
          Tu respuesta
        </label>
        <textarea
          id={campo}
          name="respuesta"
          rows={4}
          required
          maxLength={LARGO_MAXIMO_RESPUESTA}
          defaultValue={estado.respuesta}
          aria-invalid={estado.error ? true : undefined}
          aria-describedby={estado.error ? `${campo}-error` : `${campo}-ayuda`}
          className={`mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15 ${
            estado.error ? "border-destructive" : "border-input"
          }`}
        />
        {estado.error ? (
          <p id={`${campo}-error`} className="mt-1.5 text-sm text-destructive">
            {estado.error}
          </p>
        ) : (
          <p id={`${campo}-ayuda`} className="mt-1.5 text-sm text-muted-foreground">
            Una vez enviada no se puede cambiar. Si después necesitas
            agregar algo, Convivencia te pedirá otra aclaración.
          </p>
        )}
      </div>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Enviando…" : "Enviar respuesta"}
      </button>
    </form>
  );
}