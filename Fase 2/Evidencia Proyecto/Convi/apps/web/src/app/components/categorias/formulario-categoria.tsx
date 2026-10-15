"use client";

import { useActionState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import {
  crearCategoria,
  editarCategoria,
  type EstadoFormulario,
} from "./acciones";
import type { Categoria } from "./datos";
import { LARGO_MAXIMO_CATEGORIA as LARGO_MAXIMO } from "./opciones";

const estadoInicial: EstadoFormulario = {};

// PB-030 (HU-023 CA1): crear una categoría o, si recibe una, editarla. La API
// vuelve a validar cada dato; aquí solo se muestran sus mensajes junto a cada
// campo. Como hay un formulario por categoría en la misma página, los id de
// los campos llevan el id de la categoría.
export function FormularioCategoria({ categoria }: { categoria?: Categoria }) {
  const [estado, accion, pendiente] = useActionState(
    categoria ? editarCategoria : crearCategoria,
    estadoInicial,
  );
  const valores =
    estado.valores ??
    (categoria
      ? { nombre: categoria.nombre, descripcion: categoria.descripcion ?? "" }
      : {});
  const errores = estado.errores ?? {};
  const sufijo = categoria?.id ?? "nueva";
  const idDescripcion = `descripcion-${sufijo}`;
  const idAyuda = errores.descripcion
    ? `${idDescripcion}-error`
    : `${idDescripcion}-ayuda`;

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
      {categoria && <input type="hidden" name="id" value={categoria.id} />}

      <Campo
        id={`nombre-${sufijo}`}
        name="nombre"
        etiqueta="Nombre"
        required
        maxLength={LARGO_MAXIMO.nombre}
        placeholder="Agresión física"
        ayuda="No se repite en la escuela."
        defaultValue={valores.nombre}
        error={errores.nombre}
      />
      <div>
        <label htmlFor={idDescripcion} className="block text-sm font-medium">
          Descripción (opcional)
        </label>
        <textarea
          id={idDescripcion}
          name="descripcion"
          rows={3}
          maxLength={LARGO_MAXIMO.descripcion}
          defaultValue={valores.descripcion}
          aria-invalid={errores.descripcion ? true : undefined}
          aria-describedby={idAyuda}
          className={`mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/15 ${
            errores.descripcion ? "border-destructive" : "border-input"
          }`}
        />
        <p
          id={idAyuda}
          className={`mt-1.5 text-sm ${errores.descripcion ? "text-destructive" : "text-muted-foreground"}`}
        >
          {errores.descripcion ??
            "Ayuda a elegir la categoría correcta al registrar una situación."}
        </p>
      </div>

      <BotonEnviar
        pendiente={pendiente}
        textoPendiente={categoria ? "Guardando…" : "Creando categoría…"}
      >
        {categoria ? "Guardar cambios" : "Crear categoría"}
      </BotonEnviar>
    </form>
  );
}