"use client";

import { useActionState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { Selector } from "../cursos/selector";
import { type EstadoFormulario, matricularEstudiante } from "./acciones";

const estadoInicial: EstadoFormulario = {};

export type OpcionesMatricula = {
  /** Id del año académico. */
  id: string;
  anio: number;
  estado: string;
  /** AAAA-MM-DD, o null si el año no lo indica. */
  fecha_inicio: string | null;
  cursos: { id: string; codigo: string; nombre: string }[];
}[];

// PB-018 (HU-014 CA3): matricular al estudiante en un curso de un año
// Planificado o Activo. El año es el del curso; la API revisa las fechas y
// que no tenga otra matrícula al mismo tiempo.
export function FormularioMatricula({
  estudianteId,
  opciones,
  fechaSugerida,
}: {
  estudianteId: string;
  /** Cursos agrupados por año. */
  opciones: OpcionesMatricula;
  /** AAAA-MM-DD: hoy, o el inicio del año si todavía no empieza. */
  fechaSugerida: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    matricularEstudiante,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      {estado.listo && (
        <div
          role="status"
          className="rounded-lg border border-verde/30 bg-verde/10 px-3 py-2.5 text-sm"
        >
          {estado.listo}
        </div>
      )}
      <input type="hidden" name="estudiante_id" value={estudianteId} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Selector
          name="curso_id"
          etiqueta="Curso"
          defaultValue={valores.curso_id ?? ""}
          error={errores.curso_id}
        >
          <option value="" disabled>
            Elige el curso
          </option>
          {opciones.map((grupo) => (
            <optgroup key={grupo.anio} label={`Año ${grupo.anio}`}>
              {grupo.cursos.map((curso) => (
                <option key={curso.id} value={curso.id}>
                  {curso.nombre} ({curso.codigo})
                </option>
              ))}
            </optgroup>
          ))}
        </Selector>
        <Campo
          name="matriculado_en"
          etiqueta="Desde"
          type="date"
          required
          ayuda="Dentro de las fechas del año del curso."
          defaultValue={valores.matriculado_en ?? fechaSugerida}
          error={errores.matriculado_en}
        />
      </div>

      <BotonEnviar pendiente={pendiente} textoPendiente="Matriculando…">
        Matricular
      </BotonEnviar>
    </form>
  );
}