"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { guardarConfiguracionEscuela, type EstadoFicha } from "./acciones";
import type { FichaInstitucional } from "./datos";

const ZONAS = [
  ["America/Santiago", "Chile continental, Santiago"],
  ["America/Coyhaique", "Región de Aysén"],
  ["America/Punta_Arenas", "Región de Magallanes"],
  ["Pacific/Easter", "Rapa Nui, Isla de Pascua"],
];
const inicial: EstadoFicha = {};

export function FormularioConfiguracion({
  ficha,
}: {
  ficha: FichaInstitucional;
}) {
  const [estado, accion, pendiente] = useActionState(
    guardarConfiguracionEscuela,
    inicial,
    "/admin/establecimiento",
  );
  const [zona, setZona] = useState(ficha.zona_horaria);
  const desplegable = useRef<HTMLDetailsElement>(null);
  const opciones = ZONAS.some(([valor]) => valor === ficha.zona_horaria)
    ? ZONAS
    : [...ZONAS, [ficha.zona_horaria, ficha.zona_horaria]];
  const errores = estado.errores ?? {};

  useEffect(() => {
    function cerrar(evento: PointerEvent) {
      if (
        !desplegable.current?.contains(evento.target as Node) &&
        desplegable.current
      )
        desplegable.current.open = false;
    }
    document.addEventListener("pointerdown", cerrar);
    return () => document.removeEventListener("pointerdown", cerrar);
  }, []);

  return (
    <form action={accion} noValidate className="space-y-5">
      <h2 className="text-lg font-semibold">Fechas y plazos</h2>
      <p className="text-sm text-muted-foreground">
        Elige el horario de tu escuela y, si lo necesitas, un plazo sugerido
        para cerrar los casos
      </p>
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <input type="hidden" name="actualizado_en" value={ficha.actualizado_en} />
      <fieldset disabled={pendiente} className="space-y-5 disabled:opacity-70">
        <legend className="sr-only">Configuración de fechas y plazos</legend>
        <input type="hidden" name="zona_horaria" value={zona} />
        <div>
          <span id="etiqueta-zona" className="mb-1.5 block text-sm font-medium">
            Zona horaria de la escuela
          </span>
          <details
            ref={desplegable}
            className="relative"
            onKeyDown={(evento) => {
              if (evento.key === "Escape" && desplegable.current) {
                evento.preventDefault();
                desplegable.current.open = false;
                desplegable.current.querySelector("summary")?.focus();
              }
            }}
            onBlur={(evento) => {
              if (
                !evento.currentTarget.contains(
                  evento.relatedTarget as Node | null,
                )
              )
                evento.currentTarget.open = false;
            }}
          >
            <summary
              aria-labelledby="etiqueta-zona valor-zona"
              aria-describedby={
                errores.zona_horaria ? "zona-error" : "zona-ayuda"
              }
              className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden ${errores.zona_horaria ? "border-destructive" : "border-input"}`}
            >
              <span id="valor-zona">
                {opciones.find(([valor]) => valor === zona)?.[1] ?? zona}
              </span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div
              role="group"
              aria-labelledby="etiqueta-zona"
              className="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border border-border bg-card p-1.5 shadow-tarjeta"
            >
              {opciones.map(([valor, texto]) => (
                <button
                  type="button"
                  key={valor}
                  aria-pressed={zona === valor}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none ${zona === valor ? "bg-accent font-medium" : ""}`}
                  onClick={() => {
                    setZona(valor);
                    if (desplegable.current) {
                      desplegable.current.open = false;
                      desplegable.current.querySelector("summary")?.focus();
                    }
                  }}
                >
                  {texto}
                  <span aria-hidden="true">{zona === valor ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </details>
          {errores.zona_horaria ? (
            <p id="zona-error" className="mt-1.5 text-sm text-destructive">
              {errores.zona_horaria}
            </p>
          ) : (
            <p id="zona-ayuda" className="mt-1.5 text-sm text-muted-foreground">
              CONVI usará esta zona para mostrar las horas y determinar el día
              de los registros de tu escuela
            </p>
          )}
        </div>
        <Campo
          name="plazo_cierre_dias"
          etiqueta="Plazo sugerido de cierre, en días"
          type="number"
          min="1"
          max="2147483647"
          step="1"
          inputMode="numeric"
          placeholder="Sin plazo sugerido"
          defaultValue={
            estado.valores?.plazo_cierre_dias ?? ficha.plazo_cierre_dias ?? ""
          }
          error={errores.plazo_cierre_dias}
          ayuda="Se cuentan todos los días, incluidos sábados, domingos y festivos, deja el campo vacío si tu escuela no usará un plazo sugerido"
        />
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p>
            El plazo se guarda al abrir cada caso, cambiarlo aquí no modifica
            los casos que ya existen
          </p>
          <p className="mt-2">
            Por ejemplo: un caso abierto el 10 de marzo con un plazo de 7 días
            tendrá como fecha límite el 17 de marzo
          </p>
        </div>
      </fieldset>
      <div className="flex justify-end border-t border-border pt-5">
        <div className="w-full sm:w-auto">
          <BotonEnviar
            pendiente={pendiente}
            textoPendiente="Guardando configuración…"
          >
            Guardar fechas y plazos
          </BotonEnviar>
        </div>
      </div>
    </form>
  );
}
