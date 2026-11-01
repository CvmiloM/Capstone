"use client";

import { useActionState, useState } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { guardarBienvenida, type EstadoGuia } from "./acciones";
import {
  LARGO_MAXIMO_MEJORAR,
  LARGO_MAXIMO_OTRO_METODO,
  METODOS_REGISTRO,
} from "./opciones";

// PB-032 (HU-025): la pregunta es opcional; «Omitir este paso» no guarda
// ninguna respuesta (CA4).
const estadoInicial: EstadoGuia = {};
const claseCampo =
  "mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15";

export function FormularioBienvenida({
  version,
  metodo,
  otro,
  mejorar,
}: {
  version: string;
  metodo: string | null;
  otro: string | null;
  mejorar: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(
    guardarBienvenida,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const [elegido, setElegido] = useState(valores.metodo ?? metodo ?? "");

  return (
    <form action={accion} noValidate className="space-y-5">
      <input type="hidden" name="version" value={version} />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <fieldset
        aria-describedby={errores.metodo ? "metodo-error" : "metodo-ayuda"}
      >
        <legend className="text-sm font-medium">
          ¿Cómo registraba tu escuela la convivencia antes de CONVI?
        </legend>
        <p id="metodo-ayuda" className="mt-1 text-sm text-muted-foreground">
          Es opcional. Nos ayuda a entender desde dónde parte la escuela.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {METODOS_REGISTRO.map((m) => (
            <label
              key={m.valor}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-input bg-card px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name="metodo"
                value={m.valor}
                checked={elegido === m.valor}
                onChange={() => setElegido(m.valor)}
                className="accent-primary"
              />
              {m.texto}
            </label>
          ))}
        </div>
        {errores.metodo && (
          <p id="metodo-error" className="mt-1.5 text-sm text-destructive">
            {errores.metodo}
          </p>
        )}
      </fieldset>

      {elegido === "OTRO" && (
        <div>
          <label htmlFor="otro" className="block text-sm font-medium">
            ¿Cómo lo registraban?
          </label>
          <input
            id="otro"
            name="otro"
            maxLength={LARGO_MAXIMO_OTRO_METODO}
            defaultValue={valores.otro ?? otro ?? ""}
            aria-invalid={errores.otro ? true : undefined}
            aria-describedby={errores.otro ? "otro-error" : undefined}
            className={`${claseCampo} ${errores.otro ? "border-destructive" : "border-input"}`}
          />
          {errores.otro && (
            <p id="otro-error" className="mt-1.5 text-sm text-destructive">
              {errores.otro}
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="mejorar" className="block text-sm font-medium">
          ¿Qué te gustaría mejorar con CONVI? (opcional)
        </label>
        <textarea
          id="mejorar"
          name="mejorar"
          rows={3}
          maxLength={LARGO_MAXIMO_MEJORAR}
          defaultValue={valores.mejorar ?? mejorar ?? ""}
          aria-invalid={errores.mejorar ? true : undefined}
          aria-describedby={errores.mejorar ? "mejorar-error" : undefined}
          className={`${claseCampo} ${errores.mejorar ? "border-destructive" : "border-input"}`}
        />
        {errores.mejorar && (
          <p id="mejorar-error" className="mt-1.5 text-sm text-destructive">
            {errores.mejorar}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="accion"
          value="GUARDAR"
          disabled={pendiente}
          className={claseBotonPrimario}
        >
          {pendiente ? "Guardando…" : "Guardar y continuar"}
        </button>
        <button
          type="submit"
          name="accion"
          value="OMITIR"
          disabled={pendiente}
          className={claseBotonSecundario}
        >
          Omitir este paso
        </button>
      </div>
    </form>
  );
}
