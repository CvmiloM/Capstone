"use client";

import { useActionState, useState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { Selector } from "../cursos/selector";
import { cambiarMatricula, type EstadoFormulario } from "./acciones";
import type { Matricula } from "./datos";
import type { OpcionesMatricula } from "./formulario-matricula";
import { MOVIMIENTOS_MATRICULA, type TipoMovimiento } from "./opciones";

const estadoInicial: EstadoFormulario = {};

// PB-022 y PB-031 (HU-017 y HU-024): termina la matrícula vigente por cambio
// de curso, paso de año, egreso o retiro. La API vuelve a revisar el curso,
// las fechas y que la matrícula vigente sea la misma que se ve aquí.
export function FormularioCambio({
  estudianteId,
  vigente,
  opciones,
  hoy,
}: {
  estudianteId: string;
  vigente: Matricula;
  /** Cursos abiertos de años Planificados o Activos, agrupados por año. */
  opciones: OpcionesMatricula;
  /** AAAA-MM-DD en la zona horaria de la escuela. */
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    cambiarMatricula,
    estadoInicial,
  );
  const [tipo, setTipo] = useState<TipoMovimiento>("TRASLADO");
  const movimiento =
    MOVIMIENTOS_MATRICULA.find((m) => m.tipo === tipo) ??
    MOVIMIENTOS_MATRICULA[0];
  const errores = estado.errores ?? {};
  // Lo escrito se recupera solo si el error es del mismo movimiento.
  const valores = estado.valores?.tipo === tipo ? estado.valores : {};

  // Cambio de curso: otros cursos del mismo año. Paso de año: años posteriores.
  const grupos =
    tipo === "TRASLADO"
      ? opciones
          .filter((g) => g.id === vigente.anio_academico_id)
          .map((g) => ({
            ...g,
            cursos: g.cursos.filter((c) => c.id !== vigente.curso_id),
          }))
          .filter((g) => g.cursos.length > 0)
      : tipo === "PROMOCION"
        ? opciones
            .filter((g) => g.anio > vigente.anio)
            .sort((a, b) => a.anio - b.anio)
        : [];
  const conCurso = tipo === "TRASLADO" || tipo === "PROMOCION";
  const sinCursos = conCurso && grupos.length === 0;
  const fechaSugerida =
    tipo === "PROMOCION" && grupos[0]?.fecha_inicio && grupos[0].fecha_inicio > hoy
      ? grupos[0].fecha_inicio
      : hoy;

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <input type="hidden" name="estudiante_id" value={estudianteId} />
      <input type="hidden" name="matricula_id" value={vigente.id} />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">
          ¿Qué cambio vas a registrar?
        </legend>
        {MOVIMIENTOS_MATRICULA.map((m) => (
          <label
            key={m.tipo}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-input p-3 text-sm"
          >
            <input
              type="radio"
              name="tipo"
              value={m.tipo}
              checked={tipo === m.tipo}
              onChange={() => setTipo(m.tipo)}
              className="mt-1 accent-primary"
            />
            <span>
              <span className="block font-medium">{m.nombre}</span>
              <span className="text-muted-foreground">{m.detalle}</span>
            </span>
          </label>
        ))}
        {errores.tipo && (
          <p role="alert" className="text-sm text-destructive">
            {errores.tipo}
          </p>
        )}
      </fieldset>

      {conCurso &&
        (sinCursos ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            {tipo === "TRASLADO"
              ? `No hay otros cursos abiertos del año ${vigente.anio}.`
              : `No hay cursos abiertos en años posteriores a ${vigente.anio}. Crea el año y sus cursos primero.`}
          </p>
        ) : (
          <Selector
            key={`curso-${tipo}`}
            name="curso_id"
            etiqueta="Curso de destino"
            defaultValue={valores.curso_id ?? ""}
            error={errores.curso_id}
          >
            <option value="" disabled>
              Elige el curso
            </option>
            {grupos.map((grupo) => (
              <optgroup key={grupo.id} label={`Año ${grupo.anio}`}>
                {grupo.cursos.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {curso.nombre} ({curso.codigo})
                  </option>
                ))}
              </optgroup>
            ))}
          </Selector>
        ))}

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          key={`fecha-${tipo}`}
          name="fecha"
          etiqueta={movimiento.fecha}
          type="date"
          required
          max={conCurso ? undefined : hoy}
          ayuda={movimiento.ayuda}
          defaultValue={valores.fecha ?? fechaSugerida}
          error={errores.fecha}
        />
        <Campo
          name="motivo"
          etiqueta="Motivo (opcional)"
          maxLength={500}
          ayuda="Queda registrado junto al cambio."
          defaultValue={estado.valores?.motivo}
          error={errores.motivo}
        />
      </div>

      {!sinCursos && (
        <BotonEnviar pendiente={pendiente} textoPendiente="Guardando cambio…">
          {movimiento.boton}
        </BotonEnviar>
      )}
    </form>
  );
}
