"use client";

import { useActionState } from "react";
import { ConfirmarEnvio } from "@/app/components/confirmar-envio";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import {
  cambiarCancelacion,
  type EstadoFormulario,
  revalidarFilas,
} from "./acciones";
import { LARGO_MOTIVO } from "./opciones";

const estadoInicial: EstadoFormulario = {};

// PB-024 (HU-019 CA3): revisa de nuevo las filas abiertas con lo que hay hoy
// en la escuela, por ejemplo después de crear un curso que faltaba.
export function BotonRevalidar({ id }: { id: string }) {
  const [estado, accion, pendiente] = useActionState(
    revalidarFilas.bind(null, id),
    estadoInicial,
  );
  return (
    <form action={accion} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pendiente}
        className={claseBotonSecundario}
      >
        {pendiente ? "Revisando las filas…" : "Volver a revisar las filas"}
      </button>
      {estado.exito && (
        <p role="status" className="text-sm text-muted-foreground">
          {estado.exito}
        </p>
      )}
      {estado.mensaje && (
        <p role="alert" className="text-sm text-destructive">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

// PB-025 (HU-019 CA4 y CA5): cancela la importación o la restaura a su estado
// anterior. Las dos piden un motivo, que queda en la auditoría, y una
// confirmación antes de enviarse.
export function FormularioCancelacion({
  id,
  accion,
  confirmacion,
}: {
  id: string;
  accion: "cancelar" | "restaurar";
  /** Lo que se pregunta antes de enviar. */
  confirmacion: string;
}) {
  const [estado, enviar, pendiente] = useActionState(
    cambiarCancelacion.bind(null, id, accion),
    estadoInicial,
  );
  const cancelar = accion === "cancelar";
  const error = estado.errores?.motivo;
  return (
    <ConfirmarEnvio mensaje={confirmacion}>
      <form action={enviar} className="space-y-3">
        {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
        <div>
          <label htmlFor={`motivo-${accion}`} className="block text-sm font-medium">
            {cancelar ? "Motivo de la cancelación" : "Motivo de la restauración"}
          </label>
          <textarea
            id={`motivo-${accion}`}
            name="motivo"
            required
            rows={3}
            minLength={LARGO_MOTIVO.minimo}
            maxLength={LARGO_MOTIVO.maximo}
            defaultValue={estado.valores?.motivo}
            aria-invalid={error ? true : undefined}
            aria-describedby={`motivo-${accion}-ayuda`}
            className={`mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15 ${
              error ? "border-destructive" : "border-input"
            }`}
          />
          <p
            id={`motivo-${accion}-ayuda`}
            className={`mt-1.5 text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
          >
            {error ??
              `De ${LARGO_MOTIVO.minimo} a ${LARGO_MOTIVO.maximo} caracteres. Queda en la auditoría con tu nombre y la fecha.`}
          </p>
        </div>
        <button
          type="submit"
          disabled={pendiente}
          className={cancelar ? claseBotonSecundario : claseBotonPrimario}
        >
          {pendiente
            ? cancelar
              ? "Cancelando…"
              : "Restaurando…"
            : cancelar
              ? "Cancelar importación"
              : "Restaurar importación"}
        </button>
      </form>
    </ConfirmarEnvio>
  );
}
