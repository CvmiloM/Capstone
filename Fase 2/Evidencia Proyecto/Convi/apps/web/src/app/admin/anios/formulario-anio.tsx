"use client";

import { useActionState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { crearAnio, editarAnio, type EstadoFormularioAnio } from "./acciones";
import type { AnioAcademico } from "./datos";

const estadoInicial: EstadoFormularioAnio = {};

// PB-013 (HU-011): crear un año o, si recibe uno, editarlo. La API vuelve a
// validar cada dato; aquí solo se muestran sus mensajes junto a cada campo.
export function FormularioAnio({ anio }: { anio?: AnioAcademico }) {
  const [estado, accion, pendiente] = useActionState(
    anio ? editarAnio : crearAnio,
    estadoInicial,
  );
  const valores =
    estado.valores ??
    (anio
      ? {
          anio: String(anio.anio),
          fecha_inicio: anio.fecha_inicio ?? "",
          fecha_fin: anio.fecha_fin ?? "",
        }
      : {});
  const errores = estado.errores ?? {};
  // Decisión del PO: el número del año solo cambia mientras esté Planificado y sin cursos.
  const numeroFijo =
    anio !== undefined && (anio.estado !== "PLANIFICADO" || anio.cursos > 0);

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      {estado.creado && (
        <div
          role="status"
          className="rounded-lg border border-verde/30 bg-verde/10 px-3 py-2.5 text-sm"
        >
          Creaste el año {estado.creado}. Quedó Planificado hasta que lo
          actives.
        </div>
      )}
      {anio && <input type="hidden" name="id" value={anio.id} />}

      <Campo
        name="anio"
        etiqueta="Año"
        type="number"
        inputMode="numeric"
        min={2000}
        max={2200}
        required
        readOnly={numeroFijo}
        placeholder="2027"
        ayuda={
          numeroFijo
            ? "El año solo se puede cambiar mientras esté Planificado y sin cursos."
            : "No puede repetirse en tu escuela"
        }
        className={
          numeroFijo ? "[&_input]:bg-muted [&_input]:text-muted-foreground" : ""
        }
        defaultValue={valores.anio}
        error={errores.anio}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="fecha_inicio"
          etiqueta="Fecha de inicio (opcional)"
          type="date"
          defaultValue={valores.fecha_inicio}
          error={errores.fecha_inicio}
        />
        <Campo
          name="fecha_fin"
          etiqueta="Fecha de término (opcional)"
          type="date"
          defaultValue={valores.fecha_fin}
          error={errores.fecha_fin}
        />
      </div>

      <BotonEnviar
        pendiente={pendiente}
        textoPendiente={anio ? "Guardando…" : "Creando año…"}
      >
        {anio ? "Guardar cambios" : "Crear año académico"}
      </BotonEnviar>
    </form>
  );
}
