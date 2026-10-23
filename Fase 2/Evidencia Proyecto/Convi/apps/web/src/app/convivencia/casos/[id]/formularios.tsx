"use client";

import { useActionState, type ReactNode } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import { cambiarEstadoCaso, cerrarCaso, type EstadoAccion } from "./acciones";

const estadoInicial: EstadoAccion = {};

// Mismos límites que valida la API (estado-caso.ts).
const LARGO_MAXIMO_MOTIVO = 500;
const LARGO_MAXIMO_RESUMEN_CIERRE = 4000;
const LARGO_MAXIMO_JUSTIFICACION = 2000;

const claseControl =
  "mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15";

/** Etiqueta, control y mensaje de error o ayuda de un campo. */
function Campo({
  id,
  etiqueta,
  error,
  ayuda,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {etiqueta}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : (
        ayuda && (
          <p id={`${id}-ayuda`} className="mt-1.5 text-sm text-muted-foreground">
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}

/** Atributos de accesibilidad y borde de un control según su error. */
function propsControl(id: string, error?: string, ayuda?: boolean) {
  return {
    id,
    name: id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined,
    className: `${claseControl} ${error ? "border-destructive" : "border-input"}`,
  };
}

// HU-131: mueve el caso a otra etapa con un motivo. Solo se ofrecen los
// estados permitidos desde el actual (CA5).
export function FormularioEstado({
  casoId,
  ultimoMovimientoId,
  opciones,
}: {
  casoId: string;
  ultimoMovimientoId: string | null;
  opciones: { valor: string; texto: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(
    cambiarEstadoCaso,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input
        type="hidden"
        name="movimiento_anterior_id"
        value={ultimoMovimientoId ?? ""}
      />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <Campo id="estado_nuevo" etiqueta="Nuevo estado" error={errores.estado_nuevo}>
        <select
          {...propsControl("estado_nuevo", errores.estado_nuevo)}
          defaultValue={valores.estado_nuevo ?? ""}
        >
          <option value="" disabled>
            Elige un estado
          </option>
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
      </Campo>

      <Campo
        id="motivo_estado"
        etiqueta="Motivo del cambio"
        error={errores.motivo}
        ayuda="Queda en el historial del caso con tu nombre y la fecha."
      >
        <textarea
          {...propsControl("motivo_estado", errores.motivo, true)}
          rows={3}
          maxLength={LARGO_MAXIMO_MOTIVO}
          defaultValue={valores.motivo}
        />
      </Campo>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Cambiar estado"}
      </button>
    </form>
  );
}

// HU-047: cierra el caso con motivo y resumen (CA1). Si quedan tareas sin
// terminar se pide justificar cómo se atenderán (CA2) y, si el caso ya tiene
// actas, se puede adjuntar una.
export function FormularioCierre({
  casoId,
  ultimoMovimientoId,
  pendientes,
  actas,
}: {
  casoId: string;
  ultimoMovimientoId: string | null;
  /** Textos como "1 actuación planificada o pospuesta". */
  pendientes: string[];
  actas: { id: string; texto: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(cerrarCaso, estadoInicial);
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input
        type="hidden"
        name="movimiento_anterior_id"
        value={ultimoMovimientoId ?? ""}
      />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <Campo id="motivo_cierre" etiqueta="Motivo del cierre" error={errores.motivo}>
        <input
          {...propsControl("motivo_cierre", errores.motivo)}
          type="text"
          maxLength={LARGO_MAXIMO_MOTIVO}
          placeholder="Por ejemplo: objetivos cumplidos"
          defaultValue={valores.motivo}
        />
      </Campo>

      <Campo
        id="resumen_cierre"
        etiqueta="Resumen de cierre"
        error={errores.resumen_cierre}
      >
        <textarea
          {...propsControl("resumen_cierre", errores.resumen_cierre)}
          rows={4}
          maxLength={LARGO_MAXIMO_RESUMEN_CIERRE}
          defaultValue={valores.resumen_cierre}
        />
      </Campo>

      {pendientes.length > 0 && (
        <div className="rounded-xl border border-naranjo/40 bg-naranjo/10 p-4 text-sm">
          <p className="font-medium">Quedan tareas sin terminar:</p>
          <ul className="mt-1 list-inside list-disc">
            {pendientes.map((texto) => (
              <li key={texto}>{texto}</li>
            ))}
          </ul>
          <div className="mt-3">
            <Campo
              id="justificacion_pendientes"
              etiqueta="Cómo se atenderán"
              error={errores.justificacion_pendientes}
            >
              <textarea
                {...propsControl(
                  "justificacion_pendientes",
                  errores.justificacion_pendientes,
                )}
                rows={3}
                maxLength={LARGO_MAXIMO_JUSTIFICACION}
                defaultValue={valores.justificacion_pendientes}
              />
            </Campo>
          </div>
        </div>
      )}

      {actas.length > 0 && (
        <Campo
          id="evidencia_cierre_id"
          etiqueta="Acta de cierre (opcional)"
          error={errores.evidencia_cierre_id}
        >
          <select
            {...propsControl("evidencia_cierre_id", errores.evidencia_cierre_id)}
            defaultValue={valores.evidencia_cierre_id ?? ""}
          >
            <option value="">Sin acta</option>
            {actas.map((acta) => (
              <option key={acta.id} value={acta.id}>
                {acta.texto}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <p className="text-sm text-muted-foreground">
        El caso queda Cerrado con tu nombre y la fecha. No se borra nada y
        después solo se puede reabrir.
      </p>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Cerrando…" : "Cerrar caso"}
      </button>
    </form>
  );
}
