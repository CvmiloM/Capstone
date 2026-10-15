"use client";

import { useActionState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import {
  crearEstudiante,
  editarEstudiante,
  type EstadoFormulario,
} from "./acciones";
import type { FichaEstudiante } from "./datos";
import { LARGO_MAXIMO_ESTUDIANTE as LARGO_MAXIMO } from "./opciones";

const estadoInicial: EstadoFormulario = {};

// PB-017 (HU-014 CA1): crear la ficha de un estudiante o, si recibe una,
// corregirla. La API vuelve a validar cada dato; aquí solo se muestran sus
// mensajes junto a cada campo.
export function FormularioEstudiante({
  ficha,
  hoy,
}: {
  ficha?: FichaEstudiante;
  /** AAAA-MM-DD en la zona horaria de la escuela: la fecha de nacimiento no puede ser posterior. */
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    ficha ? editarEstudiante : crearEstudiante,
    estadoInicial,
  );
  const valores =
    estado.valores ??
    (ficha
      ? {
          codigo_estudiante: ficha.codigo_estudiante,
          nombres: ficha.nombres,
          apellidos: ficha.apellidos,
          rut: ficha.rut ?? "",
          fecha_nacimiento: ficha.fecha_nacimiento ?? "",
          correo: ficha.correo ?? "",
          telefono: ficha.telefono ?? "",
          direccion: ficha.direccion ?? "",
        }
      : {});
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
      {ficha && <input type="hidden" name="id" value={ficha.id} />}

      <Campo
        name="codigo_estudiante"
        etiqueta="Código del estudiante"
        required
        maxLength={LARGO_MAXIMO.codigo_estudiante}
        placeholder="2028-015"
        ayuda="El que usa la escuela. Sin espacios y no se repite."
        defaultValue={valores.codigo_estudiante}
        error={errores.codigo_estudiante}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="nombres"
          etiqueta="Nombres"
          required
          maxLength={LARGO_MAXIMO.nombres}
          autoComplete="off"
          defaultValue={valores.nombres}
          error={errores.nombres}
        />
        <Campo
          name="apellidos"
          etiqueta="Apellidos"
          required
          maxLength={LARGO_MAXIMO.apellidos}
          autoComplete="off"
          defaultValue={valores.apellidos}
          error={errores.apellidos}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="rut"
          etiqueta="RUT (opcional)"
          placeholder="12.345.678-5"
          autoComplete="off"
          ayuda="Con o sin puntos."
          defaultValue={valores.rut}
          error={errores.rut}
        />
        <Campo
          name="fecha_nacimiento"
          etiqueta="Fecha de nacimiento (opcional)"
          type="date"
          max={hoy}
          defaultValue={valores.fecha_nacimiento}
          error={errores.fecha_nacimiento}
        />
      </div>

      <fieldset className="space-y-5">
        <legend className="mb-3 text-sm font-semibold">
          Contacto (opcional)
        </legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo
            name="correo"
            etiqueta="Correo"
            type="email"
            maxLength={LARGO_MAXIMO.correo}
            autoComplete="off"
            defaultValue={valores.correo}
            error={errores.correo}
          />
          <Campo
            name="telefono"
            etiqueta="Teléfono"
            type="tel"
            maxLength={LARGO_MAXIMO.telefono}
            placeholder="+56 9 1234 5678"
            autoComplete="off"
            defaultValue={valores.telefono}
            error={errores.telefono}
          />
        </div>
        <Campo
          name="direccion"
          etiqueta="Dirección"
          maxLength={LARGO_MAXIMO.direccion}
          autoComplete="off"
          defaultValue={valores.direccion}
          error={errores.direccion}
        />
      </fieldset>

      <BotonEnviar
        pendiente={pendiente}
        textoPendiente={ficha ? "Guardando…" : "Creando ficha…"}
      >
        {ficha ? "Guardar cambios" : "Crear ficha"}
      </BotonEnviar>
    </form>
  );
}