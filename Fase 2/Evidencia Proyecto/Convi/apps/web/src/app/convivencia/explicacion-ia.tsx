"use client";

import { useActionState, useEffect, useState } from "react";
import { FormularioConCarga } from "@/app/components/actividad";
import { AvisoError, BotonEnviar } from "@/app/components/formulario";
import {
  MascotaIA,
  type FaseMascota,
  type MensajesMascota,
} from "@/app/components/normativa/mascota-ia";
import type { EstadoExplicacion } from "./acciones-explicacion";

const estadoInicial: EstadoExplicacion = {};

// Las fases mientras espera son una guía visual por tiempo, como en la orientación.
const FASES_ESPERA = ["buscando", "pensando", "escribiendo"] as const;

// Entrada con el resorte de CONVI (globals.css): sube y aparece, sin rebote.
const aparece =
  "transition-[opacity,translate] duration-[420ms] ease-resorte starting:translate-y-2 starting:opacity-0";

/**
 * PB-122 y PB-123 (HU-104): explicación con IA de valores que ya calculó el
 * servidor. El texto va a la izquierda y, a su lado, los valores que usó, para
 * que se pueda revisar cada cifra. No cambia nada ni decide nada.
 */
export function ExplicacionIA({
  accion: accionServidor,
  boton,
  mensajes,
  ayuda,
}: {
  accion: (
    anterior: EstadoExplicacion,
    formData: FormData,
  ) => Promise<EstadoExplicacion>;
  boton: string;
  mensajes: MensajesMascota;
  ayuda: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    accionServidor,
    estadoInicial,
  );
  const [paso, setPaso] = useState(0);
  const resultado = estado.resultado;

  useEffect(() => {
    if (!pendiente) return;
    const pensar = setTimeout(() => setPaso(1), 1200);
    const escribir = setTimeout(() => setPaso(2), 3200);
    return () => {
      clearTimeout(pensar);
      clearTimeout(escribir);
    };
  }, [pendiente]);

  const fase: FaseMascota = pendiente
    ? FASES_ESPERA[paso]
    : resultado
      ? "listo"
      : estado.mensaje
        ? "error"
        : "reposo";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="shrink-0">
          <MascotaIA fase={fase} mensajes={mensajes} />
        </div>
        <FormularioConCarga
          action={accion}
          onSubmit={() => setPaso(0)}
          className="flex-1 space-y-3"
        >
          <p className="text-sm text-muted-foreground">{ayuda}</p>
          {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
          <div className="sm:w-64">
            <BotonEnviar pendiente={pendiente} textoPendiente="Explicando…">
              {resultado ? "Explicar de nuevo" : boton}
            </BotonEnviar>
          </div>
        </FormularioConCarga>
      </div>

      {resultado && !pendiente && (
        <div
          key={resultado.solicitud_id ?? "sin-ia"}
          aria-live="polite"
          className="grid gap-5 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_19rem]"
        >
          <div className="space-y-3">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs ${
                resultado.generado_por_ia
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {resultado.generado_por_ia
                ? "Explicación generada con IA"
                : "Escrito por CONVI, sin IA"}
            </span>
            {resultado.parrafos.map((parrafo, i) => (
              <p
                key={i}
                className={`text-sm leading-relaxed ${aparece}`}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                {parrafo}
              </p>
            ))}
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              La IA recibió solo los valores calculados por CONVI, sin nombres de
              estudiantes, cursos ni casos: es un apoyo para leer las cifras, no
              clasifica, no predice ni diagnostica, y lo que se haga lo decide el
              equipo de Convivencia
            </p>
          </div>

          <aside
            aria-label="Valores calculados por CONVI"
            className={`h-fit rounded-xl border border-border bg-background p-4 ${aparece}`}
            style={{ transitionDelay: "120ms" }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Valores calculados por CONVI
            </h3>
            <dl className="mt-3 space-y-3">
              {resultado.valores.map((v) => (
                <div key={`${v.nombre}-${v.valor}`}>
                  <dt className="text-xs text-muted-foreground">{v.nombre}</dt>
                  <dd className="mt-0.5 text-sm font-medium tabular-nums">
                    {v.valor}
                  </dd>
                  {v.detalle && (
                    <dd className="text-xs text-muted-foreground">
                      {v.detalle}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </aside>
        </div>
      )}
    </div>
  );
}
