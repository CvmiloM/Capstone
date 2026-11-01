"use client";

import { useActionState } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
  claseEnlace,
} from "@/app/components/formulario";
import { corregirFila, type EstadoFormulario } from "./acciones";
import type { CampoImportacion } from "./datos";
import { LARGO_MAXIMO_VALOR } from "./opciones";

const estadoInicial: EstadoFormulario = {};

// PB-024 (HU-019 CA2 y CA3): corrige una fila de la vista previa. Cada campo
// relacionado parte con lo corregido o con lo del archivo, que se muestra al
// lado y nunca cambia. Al guardar, la API revisa de nuevo las filas abiertas.
export function FormularioCorreccion({
  id,
  numero,
  campos,
  delArchivo,
  corregidos,
  formatoFecha,
  volver,
}: {
  id: string;
  numero: number;
  /** Los campos relacionados con alguna columna. */
  campos: CampoImportacion[];
  /** Valor de cada campo según el archivo. */
  delArchivo: Record<string, string>;
  /** Lo ya corregido; null si la fila no tiene corrección. */
  corregidos: Record<string, string> | null;
  formatoFecha: string;
  /** El filtro y la página de la vista previa, para volver a ellos. */
  volver: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    corregirFila.bind(null, id, numero, volver),
    estadoInicial,
  );
  const ejemploFecha = formatoFecha === "MM-DD-AAAA" ? "04-15-2016" : "15-04-2016";

  return (
    <details className="mt-2" open={Boolean(estado.mensaje)}>
      <summary className={`cursor-pointer text-sm ${claseEnlace}`}>
        {corregidos ? "Cambiar la corrección" : "Corregir"}
      </summary>
      <form action={accion} className="mt-3 space-y-3">
        {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
        {campos.map((campo) => {
          const nombre = `valor-${campo.clave}`;
          const idCampo = `${nombre}-${numero}`;
          const error = estado.errores?.[campo.clave];
          const original = delArchivo[campo.clave] ?? "";
          return (
            <div key={campo.clave}>
              <label htmlFor={idCampo} className="block text-sm font-medium">
                {campo.titulo}
                {campo.obligatorio && (
                  <span className="text-muted-foreground"> (obligatorio)</span>
                )}
              </label>
              <input
                id={idCampo}
                name={nombre}
                defaultValue={
                  estado.valores?.[campo.clave] ??
                  corregidos?.[campo.clave] ??
                  original
                }
                maxLength={LARGO_MAXIMO_VALOR}
                placeholder={
                  campo.clave.startsWith("fecha_") ? ejemploFecha : undefined
                }
                aria-invalid={error ? true : undefined}
                aria-describedby={`${idCampo}-ayuda`}
                className={`mt-1 block w-full rounded-lg border bg-card px-3 py-1.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15 ${
                  error ? "border-destructive" : "border-input"
                }`}
              />
              <p
                id={`${idCampo}-ayuda`}
                className={`mt-1 text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
              >
                {error ??
                  (original ? `En el archivo: ${original}` : "En el archivo: vacío")}
              </p>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Escribe cada dato como iría en el archivo
          {campos.some((c) => c.clave.startsWith("fecha_"))
            ? `, con las fechas como ${ejemploFecha}`
            : ""}
          . El archivo original no cambia.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="accion"
            value="GUARDAR"
            disabled={pendiente}
            className={claseBotonPrimario}
          >
            {pendiente ? "Guardando…" : "Guardar corrección"}
          </button>
          {corregidos && (
            <button
              type="submit"
              name="accion"
              value="QUITAR"
              disabled={pendiente}
              className={claseBotonSecundario}
            >
              Quitar corrección
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
