"use client";

import { useActionState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import {
  crearNivel,
  editarNivel,
  type EstadoFormularioNivel,
} from "./acciones";
import type { NivelEducativo } from "./datos";
import {
  type Ciclo,
  LARGO_MAXIMO_NIVEL,
  NOMBRE_CICLO,
  TRAMOS,
} from "./opciones";

const estadoInicial: EstadoFormularioNivel = {};

// PB-014 (HU-012): crear un nivel o, si recibe uno, editarlo. La API vuelve a
// validar cada dato; aquí solo se muestran sus mensajes junto a cada campo.
export function FormularioNivel({ nivel }: { nivel?: NivelEducativo }) {
  const [estado, accion, pendiente] = useActionState(
    nivel ? editarNivel : crearNivel,
    estadoInicial,
  );
  const valores =
    estado.valores ??
    (nivel
      ? {
          codigo: nivel.codigo,
          nombre: nivel.nombre,
          orden: String(nivel.orden),
          tramo: nivel.tramo,
        }
      : {});
  const errores = estado.errores ?? {};
  // Decisión del PO: con cursos, el código, el ciclo y el tramo quedan fijos.
  const fijo = nivel !== undefined && nivel.cursos > 0;
  const ayudaFijo = "No se puede cambiar porque el nivel ya tiene cursos.";

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      {estado.creado && (
        <div
          role="status"
          className="rounded-lg border border-verde/30 bg-verde/10 px-3 py-2.5 text-sm"
        >
          Creaste el nivel {estado.creado}. Ya se puede usar en cursos nuevos.
        </div>
      )}
      {nivel && <input type="hidden" name="id" value={nivel.id} />}

      <input type="hidden" name="codigo" value={nivel?.codigo ?? ""} />
      <input type="hidden" name="orden" value={nivel?.orden ?? ""} />
      <Campo
        name="nombre"
        etiqueta="Nombre"
        required
        maxLength={LARGO_MAXIMO_NIVEL.nombre}
        placeholder="Primero básico"
        defaultValue={valores.nombre}
        error={errores.nombre}
      />
      <SelectorTramo
        defaultValue={valores.tramo ?? ""}
        fijo={fijo}
        ayuda={fijo ? ayudaFijo : "El ciclo sale del tramo que elijas."}
        error={errores.tramo}
      />

      <BotonEnviar
        pendiente={pendiente}
        textoPendiente={nivel ? "Guardando…" : "Creando nivel…"}
      >
        {nivel ? "Guardar cambios" : "Crear nivel"}
      </BotonEnviar>
    </form>
  );
}

// Lista desplegable con el mismo estilo que Campo (components/formulario.tsx).
// Agrupa los tramos por ciclo: elegir el tramo define también el ciclo.
function SelectorTramo({
  defaultValue,
  fijo,
  ayuda,
  error,
}: {
  defaultValue: string;
  fijo: boolean;
  ayuda: string;
  error?: string;
}) {
  const idDescripcion = error ? "tramo-error" : "tramo-ayuda";

  return (
    <div>
      <label htmlFor="tramo" className="block text-sm font-medium">
        Ciclo y tramo
      </label>
      {/* Un select deshabilitado no se envía: el valor fijo va oculto. */}
      {fijo && <input type="hidden" name="tramo" value={defaultValue} />}
      <select
        id="tramo"
        name={fijo ? undefined : "tramo"}
        defaultValue={defaultValue}
        disabled={fijo}
        aria-invalid={error ? true : undefined}
        aria-describedby={idDescripcion}
        className={`mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15 disabled:bg-muted disabled:text-muted-foreground ${
          error ? "border-destructive" : "border-input"
        }`}
      >
        <option value="" disabled>
          Elige el ciclo y el tramo
        </option>
        {(Object.keys(TRAMOS) as Ciclo[]).map((ciclo) => (
          <optgroup key={ciclo} label={NOMBRE_CICLO[ciclo]}>
            {TRAMOS[ciclo].map((tramo) => (
              <option key={tramo.valor} value={tramo.valor}>
                {tramo.texto}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p
        id={idDescripcion}
        className={`mt-1.5 text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
      >
        {error ?? ayuda}
      </p>
    </div>
  );
}
