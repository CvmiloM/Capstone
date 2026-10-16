"use client";

import { useActionState, useState } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import {
  confirmarImportacion,
  type EstadoFormulario,
  omitirFilas,
} from "./acciones";
import type { EstadoFila, TipoImportacion } from "./opciones";

const estadoInicial: EstadoFormulario = {};

function filas(cantidad: number) {
  return `${cantidad.toLocaleString("es-CL")} ${cantidad === 1 ? "fila" : "filas"}`;
}

// PB-026 (HU-020): confirmar guarda en las fichas las filas Válidas y, con la
// casilla, las Con advertencia; omitir deja fuera las filas Con error. Las dos
// acciones piden confirmación antes de enviarse. La API vuelve a revisar todo.
export function AccionesConfirmacion({
  id,
  tipo,
  estado,
  resumen,
  confirmadaEl,
}: {
  id: string;
  tipo: TipoImportacion;
  estado: string;
  resumen: Record<EstadoFila, number>;
  /** Fecha legible en la zona horaria de la escuela, si ya está Confirmada. */
  confirmadaEl: string | null;
}) {
  const [confirmacion, confirmar, confirmando] = useActionState(
    confirmarImportacion.bind(null, id),
    estadoInicial,
  );
  const [omision, omitir, omitiendo] = useActionState(
    omitirFilas.bind(null, id),
    estadoInicial,
  );
  const [incluirAdvertencias, setIncluirAdvertencias] = useState(true);
  const enRevision = estado === "REVISION";
  const porConfirmar =
    resumen.VALIDO + (incluirAdvertencias ? resumen.ADVERTENCIA : 0);
  const exito = confirmacion.exito ?? omision.exito;
  const error = confirmacion.mensaje ?? omision.mensaje;

  return (
    <div className="space-y-4">
      {exito && (
        <p
          role="status"
          className="rounded-lg border border-verde/40 bg-verde/10 px-3 py-2.5 text-sm"
        >
          {exito}
        </p>
      )}
      {error && <AvisoError>{error}</AvisoError>}

      {estado === "CONFIRMADO" && (
        <p className="text-sm text-muted-foreground">
          La importación quedó Confirmada
          {confirmadaEl ? ` el ${confirmadaEl}` : ""}:{" "}
          {filas(resumen.CONFIRMADO)} guardadas en las fichas y{" "}
          {filas(resumen.OMITIDO)} omitidas.
        </p>
      )}

      {enRevision && (
        <form
          action={confirmar}
          onSubmit={(evento) => {
            const aviso =
              tipo === "PROFESORES"
                ? `Se van a guardar ${filas(porConfirmar)} en las fichas y cada profesor nuevo recibirá su invitación por correo. ¿Confirmar?`
                : `Se van a guardar ${filas(porConfirmar)} en las fichas de la escuela. ¿Confirmar?`;
            if (!window.confirm(aviso)) evento.preventDefault();
          }}
          className="space-y-3"
        >
          <p className="text-sm text-muted-foreground">
            {resumen.VALIDO + resumen.ADVERTENCIA === 0
              ? "No quedan filas para confirmar."
              : `Se crearán o reutilizarán los registros de ${filas(resumen.VALIDO)} ${resumen.VALIDO === 1 ? "válida" : "válidas"}${
                  incluirAdvertencias && resumen.ADVERTENCIA > 0
                    ? ` y ${filas(resumen.ADVERTENCIA)} con advertencia`
                    : ""
                }. Antes de guardar, cada fila se revisa de nuevo con los datos de hoy.`}
            {tipo === "PROFESORES" &&
              " Cada profesor nuevo recibe su invitación por correo."}
          </p>
          {resumen.ADVERTENCIA > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="incluir_advertencias"
                value="si"
                checked={incluirAdvertencias}
                onChange={(evento) =>
                  setIncluirAdvertencias(evento.currentTarget.checked)
                }
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                Incluir también las {filas(resumen.ADVERTENCIA)} con
                advertencia. Revisa antes su detalle en la vista previa.
              </span>
            </label>
          )}
          <button
            type="submit"
            disabled={confirmando || omitiendo || porConfirmar === 0}
            className={claseBotonPrimario}
          >
            {confirmando ? "Confirmando…" : `Confirmar ${filas(porConfirmar)}`}
          </button>
        </form>
      )}

      {enRevision && resumen.ERROR > 0 && (
        <form
          action={omitir}
          onSubmit={(evento) => {
            if (
              !window.confirm(
                `Las ${filas(resumen.ERROR)} con error no se van a importar. ¿Omitirlas?`,
              )
            )
              evento.preventDefault();
          }}
          className="space-y-2 border-t border-border pt-4"
        >
          <p className="text-sm text-muted-foreground">
            Las filas con error no se pueden confirmar. Si no las vas a corregir
            en el archivo, omítelas: así la importación puede quedar Confirmada.
          </p>
          <button
            type="submit"
            disabled={confirmando || omitiendo}
            className={claseBotonSecundario}
          >
            {omitiendo
              ? "Omitiendo…"
              : `Omitir las ${filas(resumen.ERROR)} con error`}
          </button>
        </form>
      )}
    </div>
  );
}