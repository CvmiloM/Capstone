"use client";

import { useActionState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { asignarProfesor, type EstadoFormulario } from "./acciones";
import type { ProfesorDisponible } from "./datos";
import { NOMBRE_ROL, type Rol } from "./opciones";
import { Selector } from "./selector";

const estadoInicial: EstadoFormulario = {};

// PB-015 (HU-013): asignar un profesor al curso como profesor jefe o profesor
// del curso. La API revisa CA2, CA3 y que haya un solo profesor jefe.
export function FormularioAsignacion({
  cursoId,
  profesores,
  hoy,
}: {
  cursoId: string;
  profesores: ProfesorDisponible[];
  /** AAAA-MM-DD en la zona horaria de la escuela: inicio por defecto. */
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    asignarProfesor,
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
      <input type="hidden" name="curso_id" value={cursoId} />

      <Selector
        name="membresia_id"
        etiqueta="Profesor"
        defaultValue={valores.membresia_id ?? ""}
        ayuda="Profesores con la cuenta activa o con la invitación pendiente."
        error={errores.membresia_id}
      >
        <option value="" disabled>
          Elige un profesor
        </option>
        {profesores.map((profesor) => (
          <option key={profesor.membresia_id} value={profesor.membresia_id}>
            {profesor.apellidos}, {profesor.nombres}
            {profesor.estado === "PENDIENTE" ? " · invitación pendiente" : ""}
          </option>
        ))}
      </Selector>
      <Selector
        name="rol"
        etiqueta="Rol"
        defaultValue={valores.rol ?? "PROFESOR"}
        error={errores.rol}
      >
        {(Object.keys(NOMBRE_ROL) as Rol[]).map((rol) => (
          <option key={rol} value={rol}>
            {NOMBRE_ROL[rol]}
          </option>
        ))}
      </Selector>
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="fecha_inicio"
          etiqueta="Desde"
          type="date"
          required
          defaultValue={valores.fecha_inicio ?? hoy}
          error={errores.fecha_inicio}
        />
        <Campo
          name="fecha_fin"
          etiqueta="Hasta (opcional)"
          type="date"
          ayuda="Déjalo vacío si no tiene fecha de término."
          defaultValue={valores.fecha_fin}
          error={errores.fecha_fin}
        />
      </div>

      <BotonEnviar pendiente={pendiente} textoPendiente="Asignando…">
        Asignar profesor
      </BotonEnviar>
    </form>
  );
}