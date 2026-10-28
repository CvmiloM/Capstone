"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  AvisoError,
  BotonEnviar,
  claseEnlace,
} from "@/app/components/formulario";
import {
  MascotaIA,
  type FaseMascota,
  type MensajesMascota,
} from "@/app/components/normativa/mascota-ia";
import {
  orientarCaso,
  type ElementoOrientacion,
  type EstadoOrientacion,
  type ReferenciaOrientacion,
} from "./acciones-orientacion";

const estadoInicial: EstadoOrientacion = {};
const LARGO_MAXIMO = 500;

// Las fases mientras espera son una guía visual por tiempo, como en el reglamento.
const FASES_ESPERA = ["buscando", "pensando", "escribiendo"] as const;

const MENSAJES: MensajesMascota = {
  reposo:
    "Puedo revisar el expediente y decirte qué indican el reglamento y los protocolos para este caso",
  buscando: "Leyendo el expediente y buscando en el reglamento…",
  pensando: "Ordenando los hechos y la normativa…",
  escribiendo: "Escribiendo la orientación…",
  listo: "Listo, revisa los hechos y las fuentes antes de decidir",
  "sin-disposicion": "La normativa no indica pasos para esto",
};

function Referencias({
  ids,
  porId,
}: {
  ids: string[];
  porId: Map<string, ReferenciaOrientacion>;
}) {
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const r = porId.get(id);
        if (!r) return null;
        const clase = `rounded-full px-2 py-0.5 text-xs ${
          r.tipo === "EXPEDIENTE"
            ? "bg-muted text-muted-foreground"
            : "bg-accent text-accent-foreground"
        }`;
        return r.enlace ? (
          <Link key={id} href={r.enlace} className={`${clase} hover:underline`}>
            {r.etiqueta}
          </Link>
        ) : (
          <span key={id} className={clase}>
            {r.etiqueta}
          </span>
        );
      })}
    </span>
  );
}

function Lista({
  elementos,
  porId,
  numerada,
}: {
  elementos: ElementoOrientacion[];
  porId: Map<string, ReferenciaOrientacion>;
  numerada?: boolean;
}) {
  const Etiqueta = numerada ? "ol" : "ul";
  return (
    <Etiqueta
      className={`mt-2 space-y-3 pl-5 text-sm ${numerada ? "list-decimal" : "list-disc"}`}
    >
      {elementos.map((e, i) => (
        <li key={i}>
          <span>{e.texto}</span>
          <Referencias ids={e.referencias} porId={porId} />
        </li>
      ))}
    </Etiqueta>
  );
}

/**
 * PB-120 y PB-121 (HU-103): orientación con IA dentro del expediente. Separa los
 * hechos documentados de los pasos que indica la normativa, con sus fuentes, y se
 * presenta como apoyo revisable (PB-148): no cambia el caso ni decide nada.
 */
export function OrientacionCaso({ casoId }: { casoId: string }) {
  const [estado, accion, pendiente] = useActionState(
    orientarCaso.bind(null, casoId),
    estadoInicial,
  );
  const [paso, setPaso] = useState(0);
  const resultado = estado.resultado;

  useEffect(() => {
    if (!pendiente) return;
    const pensar = setTimeout(() => setPaso(1), 1500);
    const escribir = setTimeout(() => setPaso(2), 3500);
    return () => {
      clearTimeout(pensar);
      clearTimeout(escribir);
    };
  }, [pendiente]);

  const fase: FaseMascota = pendiente
    ? FASES_ESPERA[paso]
    : resultado
      ? resultado.sin_disposicion
        ? "sin-disposicion"
        : "listo"
      : estado.mensaje && !estado.errores
        ? "error"
        : "reposo";

  const conPregunta = Boolean(estado.pregunta);
  const mensajes: MensajesMascota = {
    ...MENSAJES,
    listo: conPregunta
      ? "Listo, ahí está la respuesta a tu pregunta con sus fuentes"
      : MENSAJES.listo,
  };
  const porId = new Map(resultado?.referencias.map((r) => [r.id, r]) ?? []);
  const fuentesNormativas =
    resultado?.referencias.filter((r) => r.tipo === "REGLAMENTO") ?? [];

  return (
    <div className="space-y-4">
      <MascotaIA fase={fase} mensajes={mensajes} />

      <form action={accion} onSubmit={() => setPaso(0)} className="space-y-3">
        <div>
          <label
            htmlFor="pregunta-orientacion"
            className="block text-sm font-medium"
          >
            ¿Algo puntual que quieras saber? (opcional)
          </label>
          <textarea
            id="pregunta-orientacion"
            name="pregunta"
            key={estado.pregunta ?? ""}
            defaultValue={estado.pregunta}
            maxLength={LARGO_MAXIMO}
            rows={2}
            placeholder="Por ejemplo: ¿a quién hay que citar primero?"
            aria-invalid={estado.errores?.pregunta ? true : undefined}
            aria-describedby="pregunta-orientacion-ayuda"
            className={`mt-1.5 block w-full resize-y rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/15 ${
              estado.errores?.pregunta ? "border-destructive" : "border-input"
            }`}
          />
          <p
            id="pregunta-orientacion-ayuda"
            className={`mt-1.5 text-sm ${estado.errores?.pregunta ? "text-destructive" : "text-muted-foreground"}`}
          >
            {estado.errores?.pregunta ??
              "La IA recibe el expediente con seudónimos, sin nombres, RUT ni datos de contacto, y no clasifica, predice ni diagnostica a estudiantes."}
          </p>
        </div>
        {estado.mensaje && !estado.errores && (
          <AvisoError>{estado.mensaje}</AvisoError>
        )}
        <div className="sm:w-64">
          <BotonEnviar
            pendiente={pendiente}
            textoPendiente="Revisando el caso…"
          >
            ¿Qué se debe hacer?
          </BotonEnviar>
        </div>
      </form>

      {resultado && !pendiente && (
        <div
          aria-live="polite"
          className="space-y-4 border-t border-border pt-4"
        >
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Orientación generada con IA a partir del expediente y la normativa
            publicada: es un apoyo para revisar con sus fuentes, no decide
            sanciones ni cambia el caso, y la decisión es del equipo.
          </p>

          {resultado.fuera_de_limite ? (
            <p className="text-sm">{resultado.texto_sin_disposicion}</p>
          ) : conPregunta ? (
            <>
              {/* Con pregunta puntual, primero la respuesta directa con sus fuentes. */}
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">Tu pregunta</p>
                <p className="mt-0.5 text-sm font-medium">{estado.pregunta}</p>
                <h3 className="mt-3 text-sm font-semibold">Respuesta</h3>
                {resultado.respuesta ? (
                  <p className="mt-1 text-sm leading-relaxed">
                    {resultado.respuesta.texto}
                    <Referencias
                      ids={resultado.respuesta.referencias}
                      porId={porId}
                    />
                  </p>
                ) : resultado.sin_disposicion ? (
                  <p className="mt-1 text-sm">
                    {resultado.texto_sin_disposicion}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    La normativa no responde esto de forma directa, revisa los
                    pasos relacionados de abajo.
                  </p>
                )}
              </div>

              {resultado.pasos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">Pasos relacionados</h3>
                  <Lista elementos={resultado.pasos} porId={porId} numerada />
                </div>
              )}

              {resultado.hechos.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">
                    Hechos del caso considerados
                  </summary>
                  <Lista elementos={resultado.hechos} porId={porId} />
                </details>
              )}
            </>
          ) : (
            <>
              {resultado.hechos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">Hechos del caso</h3>
                  <Lista elementos={resultado.hechos} porId={porId} />
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold">
                  Lo que indica la normativa
                </h3>
                {resultado.sin_disposicion ? (
                  <p className="mt-2 text-sm">
                    {resultado.texto_sin_disposicion}
                  </p>
                ) : (
                  <Lista elementos={resultado.pasos} porId={porId} numerada />
                )}
              </div>
            </>
          )}

          {/* Fuentes y avisos, con o sin pregunta. */}
          {!resultado.fuera_de_limite && (
            <>
              {fuentesNormativas.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">
                    Ver los fragmentos del reglamento citados
                  </summary>
                  <ul className="mt-2 space-y-3">
                    {fuentesNormativas.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-lg border border-border p-3"
                      >
                        <p className="font-medium">{f.etiqueta}</p>
                        <blockquote className="mt-1.5 border-l-2 border-border pl-3 text-muted-foreground">
                          {f.extracto}
                        </blockquote>
                        {f.enlace && (
                          <Link
                            href={f.enlace}
                            className={`mt-2 inline-block ${claseEnlace}`}
                          >
                            Abrir en esa página
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {resultado.descartados > 0 && (
                <p className="text-xs text-muted-foreground">
                  CONVI quitó {resultado.descartados}{" "}
                  {resultado.descartados === 1 ? "elemento" : "elementos"} de la
                  respuesta porque clasificaban, predecían o diagnosticaban a
                  una persona.
                </p>
              )}
            </>
          )}

          {resultado.seudonimos.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Quién es quién en esta orientación
              </summary>
              <p className="mt-1 text-xs text-muted-foreground">
                Solo tú ves esta equivalencia: la IA trabajó únicamente con los
                seudónimos.
              </p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                {resultado.seudonimos.map((s) => (
                  <div key={s.alias} className="contents">
                    <dt className="font-medium">{s.alias}</dt>
                    <dd>
                      {s.nombre}
                      {s.detalle && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {s.detalle}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
