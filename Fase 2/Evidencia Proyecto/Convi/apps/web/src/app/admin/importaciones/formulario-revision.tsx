"use client";

import { useActionState } from "react";
import { AvisoError, BotonEnviar } from "@/app/components/formulario";
import { Selector } from "../cursos/selector";
import { type EstadoFormulario, revisarImportacion } from "./acciones";
import type { DetalleImportacion } from "./datos";
import { FORMATOS_FECHA, TRATAMIENTOS_DUPLICADO } from "./opciones";

const estadoInicial: EstadoFormulario = {};

// PB-020 (HU-015 CA3): qué campo de CONVI trae cada columna del archivo, el
// año, cómo vienen las fechas y qué hacer con lo que ya existe. Llega con el
// campo sugerido por el título de cada columna o con la última revisión; la
// API vuelve a validar todo.
export function FormularioRevision({
  importacion,
  ejemplo,
}: {
  importacion: Pick<
    DetalleImportacion,
    | "id"
    | "campos"
    | "columnas"
    | "mapeo"
    | "opciones"
    | "anios"
    | "uso_del_anio"
  >;
  /** Una fila del archivo, para mostrar cómo vienen los datos. */
  ejemplo: { numero_fila: number; datos: Record<string, string> } | null;
}) {
  const [estado, accion, pendiente] = useActionState(
    revisarImportacion.bind(null, importacion.id),
    estadoInicial,
  );
  const errores = estado.errores ?? {};
  const valores = estado.valores;
  const { campos, columnas, mapeo, opciones, anios, uso_del_anio } =
    importacion;

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}

      <div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Campo de CONVI para cada columna del archivo
            </caption>
            <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Columna del archivo
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {ejemplo
                    ? `Ejemplo (fila ${ejemplo.numero_fila})`
                    : "Ejemplo"}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Campo de CONVI
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {columnas.map((columna, i) => (
                <tr key={columna}>
                  <th scope="row" className="px-4 py-2 font-medium">
                    {columna}
                    <input
                      type="hidden"
                      name={`columna-${i}`}
                      value={columna}
                    />
                  </th>
                  <td className="max-w-56 truncate px-4 py-2 text-muted-foreground">
                    {ejemplo?.datos[columna] || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      name={`mapeo-${i}`}
                      aria-label={`Campo de CONVI para la columna ${columna}`}
                      defaultValue={
                        valores?.[`mapeo-${i}`] ?? mapeo[columna] ?? ""
                      }
                      className="block w-full min-w-48 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15"
                    >
                      <option value="">No importar</option>
                      {campos.map((campo) => (
                        <option key={campo.clave} value={campo.clave}>
                          {campo.titulo}
                          {campo.obligatorio ? " (obligatorio)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errores.mapeo && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {errores.mapeo}
          </p>
        )}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-primary">
            Qué trae cada campo
          </summary>
          <dl className="mt-2 space-y-2">
            {campos.map((campo) => (
              <div key={campo.clave}>
                <dt className="font-medium">
                  {campo.titulo}
                  <span className="font-normal text-muted-foreground">
                    {campo.obligatorio ? " · obligatorio" : " · opcional"}
                  </span>
                </dt>
                <dd className="text-muted-foreground">{campo.descripcion}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {uso_del_anio !== "NUNCA" && (
          <Selector
            name="anio_academico_id"
            etiqueta="Año académico"
            defaultValue={
              valores?.anio_academico_id ?? opciones.anio_academico_id ?? ""
            }
            ayuda={
              anios.length === 0
                ? "No hay años planificados ni activos: crea uno en Años académicos."
                : uso_del_anio === "CON_CURSO"
                  ? "Solo se usa si relacionas la columna Curso."
                  : "Los cursos se buscan en este año."
            }
            error={errores.anio_academico_id}
          >
            <option value="">Elige el año</option>
            {anios.map((anio) => (
              <option key={anio.id} value={anio.id}>
                {anio.anio}
                {anio.estado === "ACTIVO" ? " (activo)" : " (planificado)"}
              </option>
            ))}
          </Selector>
        )}
        <Selector
          name="formato_fecha"
          etiqueta="Fechas escritas como texto"
          defaultValue={valores?.formato_fecha ?? opciones.formato_fecha}
          ayuda="Las celdas con formato de fecha de Excel se leen solas."
          error={errores.formato_fecha}
        >
          {FORMATOS_FECHA.map((formato) => (
            <option key={formato.valor} value={formato.valor}>
              {formato.nombre}
            </option>
          ))}
        </Selector>
        <Selector
          name="duplicados"
          etiqueta="Si ya existe en CONVI"
          defaultValue={valores?.duplicados ?? opciones.duplicados}
          ayuda="La importación nunca cambia una ficha que ya existe."
          error={errores.duplicados}
        >
          {TRATAMIENTOS_DUPLICADO.map((tratamiento) => (
            <option key={tratamiento.valor} value={tratamiento.valor}>
              {tratamiento.nombre}
            </option>
          ))}
        </Selector>
      </div>

      <div className="md:w-64">
        <BotonEnviar pendiente={pendiente} textoPendiente="Revisando filas…">
          Revisar filas
        </BotonEnviar>
      </div>
    </form>
  );
}