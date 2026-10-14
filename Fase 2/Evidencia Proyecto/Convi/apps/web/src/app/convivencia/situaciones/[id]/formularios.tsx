"use client";

import { useActionState } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { OPCIONES_URGENCIA } from "@/app/profesor/situacion-opciones";
import { cambiarUrgencia, iniciarRevision, type EstadoAccion } from "./acciones";

const estadoInicial: EstadoAccion = {};

// Mismo límite que valida la API (cambio-urgencia.ts).
const LARGO_MAXIMO_MOTIVO = 500;

const claseControl =
  "mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15";

// HU-037 CA2: botón para empezar la revisión de una situación Nueva.
export function FormularioRevision({ situacionId }: { situacionId: string }) {
  const [estado, accion, pendiente] = useActionState(
    iniciarRevision,
    estadoInicial,
  );
  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="situacion_id" value={situacionId} />
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Iniciando…" : "Iniciar revisión"}
      </button>
    </form>
  );
}

// HU-037 CA3: cambio de urgencia con motivo obligatorio.
export function FormularioUrgencia({
  situacionId,
  urgenciaActual,
}: {
  situacionId: string;
  urgenciaActual: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    cambiarUrgencia,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const opciones = OPCIONES_URGENCIA.filter((o) => o.valor !== urgenciaActual);

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="situacion_id" value={situacionId} />
      <input type="hidden" name="urgencia_anterior" value={urgenciaActual} />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <div>
        <label htmlFor="urgencia" className="block text-sm font-medium">
          Nueva urgencia
        </label>
        <select
          id="urgencia"
          name="urgencia"
          defaultValue={valores.urgencia ?? ""}
          aria-invalid={errores.urgencia ? true : undefined}
          aria-describedby={errores.urgencia ? "urgencia-error" : undefined}
          className={`${claseControl} ${errores.urgencia ? "border-destructive" : "border-input"}`}
        >
          <option value="" disabled>
            Elige una urgencia
          </option>
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
        {errores.urgencia && (
          <p id="urgencia-error" className="mt-1.5 text-sm text-destructive">
            {errores.urgencia}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="motivo" className="block text-sm font-medium">
          Motivo del cambio
        </label>
        <textarea
          id="motivo"
          name="motivo"
          rows={3}
          maxLength={LARGO_MAXIMO_MOTIVO}
          defaultValue={valores.motivo}
          aria-invalid={errores.motivo ? true : undefined}
          aria-describedby={errores.motivo ? "motivo-error" : "motivo-ayuda"}
          className={`${claseControl} ${errores.motivo ? "border-destructive" : "border-input"}`}
        />
        {errores.motivo ? (
          <p id="motivo-error" className="mt-1.5 text-sm text-destructive">
            {errores.motivo}
          </p>
        ) : (
          <p id="motivo-ayuda" className="mt-1.5 text-sm text-muted-foreground">
            Queda registrado en la auditoría junto con quién hizo el cambio.
          </p>
        )}
      </div>

      <button type="submit" disabled={pendiente} className={claseBotonSecundario}>
        {pendiente ? "Guardando…" : "Cambiar urgencia"}
      </button>
    </form>
  );
}
