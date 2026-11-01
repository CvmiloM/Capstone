"use client";

import { useActionState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import type { NivelEducativo } from "../niveles/datos";
import { crearCurso, editarCurso, type EstadoFormulario } from "./acciones";
import { CampoMotivo } from "./campo-motivo";
import type { Curso } from "./datos";
import { LARGO_MAXIMO_CURSO as LARGO_MAXIMO } from "./opciones";
import { Selector } from "./selector";

const estadoInicial: EstadoFormulario = {};

// PB-015 (HU-013): crear un curso en un año o, si recibe uno, editarlo. La API
// vuelve a validar cada dato; aquí solo se muestran sus mensajes junto a cada campo.
export function FormularioCurso({
  curso,
  anioId,
  niveles,
  correccion = false,
}: {
  curso?: Curso;
  /** Año del curso nuevo; al editar no se envía porque el año no cambia. */
  anioId?: string;
  /** Niveles que se pueden elegir: los activos y, al editar, el actual. */
  niveles: NivelEducativo[];
  /** PB-023: el año está Cerrado y el cambio es una corrección con motivo. */
  correccion?: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(
    curso ? editarCurso : crearCurso,
    estadoInicial,
  );
  const valores =
    estado.valores ??
    (curso
      ? {
          codigo: curso.codigo,
          nombre: curso.nombre,
          seccion: curso.seccion ?? "",
          nivel_id: curso.nivel_id,
        }
      : {});
  const errores = estado.errores ?? {};
  // Decisión del PO: con estudiantes, el nivel del curso ya no cambia.
  const nivelFijo = curso !== undefined && curso.matriculas > 0;

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
      {curso && <input type="hidden" name="id" value={curso.id} />}
      {anioId && (
        <input type="hidden" name="anio_academico_id" value={anioId} />
      )}
      {errores.anio_academico_id && (
        <AvisoError>{errores.anio_academico_id}</AvisoError>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <input type="hidden" name="codigo" value={curso?.codigo ?? ""} />
        <Campo
          name="seccion"
          etiqueta="Sección (opcional)"
          maxLength={LARGO_MAXIMO.seccion}
          placeholder="Ejemplo: A, B o C"
          defaultValue={valores.seccion}
          error={errores.seccion}
        />
      </div>
      <Campo
        name="nombre"
        etiqueta="Nombre"
        required
        maxLength={LARGO_MAXIMO.nombre}
        placeholder="Primero A"
        defaultValue={valores.nombre}
        error={errores.nombre}
      />
      <Selector
        name="nivel_id"
        etiqueta="Nivel educativo"
        defaultValue={valores.nivel_id ?? ""}
        fijo={nivelFijo}
        ayuda={
          nivelFijo
            ? "No se puede cambiar porque el curso ya tiene estudiantes."
            : undefined
        }
        error={errores.nivel_id}
      >
        <option value="" disabled>
          Elige el nivel
        </option>
        {niveles.map((nivel) => (
          <option key={nivel.id} value={nivel.id}>
            {nivel.nombre} ({nivel.codigo})
            {nivel.activo ? "" : " · desactivado"}
          </option>
        ))}
      </Selector>

      {correccion && curso && (
        <CampoMotivo
          id={`motivo-curso-${curso.id}`}
          anio={curso.anio}
          defaultValue={estado.valores?.motivo}
          error={errores.motivo}
        />
      )}

      <BotonEnviar
        pendiente={pendiente}
        textoPendiente={curso ? "Guardando…" : "Creando curso…"}
      >
        {correccion
          ? "Guardar corrección"
          : curso
            ? "Guardar cambios"
            : "Crear curso"}
      </BotonEnviar>
    </form>
  );
}
