"use client";

import { useActionState } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { OPCIONES_URGENCIA } from "@/app/profesor/situacion-opciones";
import {
  asignarResponsable,
  cambiarUrgencia,
  iniciarRevision,
  pedirAclaracion,
  type EstadoAccion,
} from "./acciones";

const estadoInicial: EstadoAccion = {};

// Mismos límites que valida la API (cambio-urgencia.ts y nueva-aclaracion.ts).
const LARGO_MAXIMO_MOTIVO = 500;
const LARGO_MAXIMO_PREGUNTA = 2000;

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

// HU-039: asigna o cambia a quien revisa. La primera asignación no pide
// motivo; cambiar a quien ya estaba sí (CA3).
export function FormularioResponsable({
  situacionId,
  responsableActual,
  opciones,
}: {
  situacionId: string;
  responsableActual: string | null;
  opciones: { id: string; nombre: string; propia: boolean }[];
}) {
  const [estado, accion, pendiente] = useActionState(
    asignarResponsable,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const disponibles = opciones.filter((o) => o.id !== responsableActual);

  if (disponibles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay otras cuentas activas del equipo de Convivencia para asignar.
      </p>
    );
  }

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="situacion_id" value={situacionId} />
      <input
        type="hidden"
        name="responsable_anterior_id"
        value={responsableActual ?? ""}
      />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <div>
        <label htmlFor="responsable_id" className="block text-sm font-medium">
          {responsableActual ? "Nuevo responsable" : "Responsable"}
        </label>
        <select
          id="responsable_id"
          name="responsable_id"
          defaultValue={valores.responsable_id ?? ""}
          aria-invalid={errores.responsable_id ? true : undefined}
          aria-describedby={
            errores.responsable_id ? "responsable_id-error" : undefined
          }
          className={`${claseControl} ${errores.responsable_id ? "border-destructive" : "border-input"}`}
        >
          <option value="" disabled>
            Elige a una persona de Convivencia
          </option>
          {disponibles.map((opcion) => (
            <option key={opcion.id} value={opcion.id}>
              {opcion.propia ? `${opcion.nombre} (tú)` : opcion.nombre}
            </option>
          ))}
        </select>
        {errores.responsable_id && (
          <p
            id="responsable_id-error"
            className="mt-1.5 text-sm text-destructive"
          >
            {errores.responsable_id}
          </p>
        )}
      </div>

      {responsableActual && (
        <div>
          <label
            htmlFor="motivo_responsable"
            className="block text-sm font-medium"
          >
            Motivo del cambio
          </label>
          <textarea
            id="motivo_responsable"
            name="motivo"
            rows={3}
            maxLength={LARGO_MAXIMO_MOTIVO}
            defaultValue={valores.motivo}
            aria-invalid={errores.motivo ? true : undefined}
            aria-describedby={
              errores.motivo
                ? "motivo_responsable-error"
                : "motivo_responsable-ayuda"
            }
            className={`${claseControl} ${errores.motivo ? "border-destructive" : "border-input"}`}
          />
          {errores.motivo ? (
            <p
              id="motivo_responsable-error"
              className="mt-1.5 text-sm text-destructive"
            >
              {errores.motivo}
            </p>
          ) : (
            <p
              id="motivo_responsable-ayuda"
              className="mt-1.5 text-sm text-muted-foreground"
            >
              Queda registrado en la auditoría junto con quién hizo el cambio.
            </p>
          )}
        </div>
      )}

      <button type="submit" disabled={pendiente} className={claseBotonSecundario}>
        {pendiente
          ? "Guardando…"
          : responsableActual
            ? "Cambiar responsable"
            : "Asignar responsable"}
      </button>
    </form>
  );
}

// HU-038: pregunta al profesor que registró la situación. Una vez enviada no
// se modifica (CA3).
export function FormularioAclaracion({
  situacionId,
  profesor,
}: {
  situacionId: string;
  profesor: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    pedirAclaracion,
    estadoInicial,
  );
  const error = estado.errores?.pregunta;

  return (
    <form
      action={accion}
      noValidate
      className="mt-4 space-y-3 border-t border-border pt-4"
    >
      <input type="hidden" name="situacion_id" value={situacionId} />
      {estado.mensaje && !error && <AvisoError>{estado.mensaje}</AvisoError>}
      <div>
        <label htmlFor="pregunta" className="block text-sm font-medium">
          Pedir una aclaración a {profesor}
        </label>
        <textarea
          id="pregunta"
          name="pregunta"
          rows={3}
          maxLength={LARGO_MAXIMO_PREGUNTA}
          defaultValue={estado.valores?.pregunta}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "pregunta-error" : "pregunta-ayuda"}
          className={`${claseControl} ${error ? "border-destructive" : "border-input"}`}
        />
        {error ? (
          <p id="pregunta-error" className="mt-1.5 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p id="pregunta-ayuda" className="mt-1.5 text-sm text-muted-foreground">
            La situación pasa a Información solicitada hasta que el profesor
            responda. La pregunta no se puede cambiar después de enviarla.
          </p>
        )}
      </div>
      <button type="submit" disabled={pendiente} className={claseBotonSecundario}>
        {pendiente ? "Enviando…" : "Pedir aclaración"}
      </button>
    </form>
  );
}
