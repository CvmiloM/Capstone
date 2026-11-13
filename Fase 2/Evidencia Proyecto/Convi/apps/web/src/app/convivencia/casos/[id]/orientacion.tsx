"use client";

import { FormularioConCarga } from "@/app/components/actividad";

import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  AvisoError,
  BotonEnviar,
  claseBotonSecundario,
  claseEnlace,
} from "@/app/components/formulario";
import {
  MascotaIA,
  type FaseMascota,
  type MensajesMascota,
} from "@/app/components/normativa/mascota-ia";
import {
  orientarCaso,
  orientarSituacion,
  type ElementoOrientacion,
  type EstadoOrientacion,
  type Orientacion,
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

// Textos que cambian entre el caso y la revisión de una situación.
const TEXTOS = {
  caso: {
    reposo: MENSAJES.reposo,
    buscando: MENSAJES.buscando,
    sugerencias: [
      "¿Qué hechos están documentados en este caso?",
      "¿Qué compromisos siguen pendientes?",
      "¿Qué indica el reglamento para este caso?",
      "¿Qué antecedentes conviene revisar antes del próximo seguimiento?",
    ],
    etiqueta: "¿Algo puntual que quieras saber? (opcional)",
    ejemplo: "Por ejemplo: ¿a quién hay que citar primero?",
    ayuda:
      "La IA recibe el expediente con seudónimos, sin nombres, RUT ni datos de contacto, y no clasifica, predice ni diagnostica a estudiantes.",
    boton: "¿Qué se debe hacer?",
    pendiente: "Revisando el caso…",
    aviso:
      "Orientación generada con IA a partir del expediente y la normativa publicada: es un apoyo para revisar con sus fuentes, no decide sanciones ni cambia el caso, y la decisión es del equipo.",
    hechos: "Hechos del caso",
  },
  situacion: {
    reposo:
      "Pregúntame qué indican el reglamento y los protocolos de tu escuela para esta situación",
    buscando: "Leyendo la situación y buscando en el reglamento…",
    sugerencias: [],
    etiqueta: "¿Qué quieres saber de la normativa? (opcional)",
    ejemplo: "Por ejemplo: ¿qué protocolo corresponde y en qué plazo?",
    ayuda:
      "La IA recibe la situación con seudónimos, sin nombres, RUT ni datos de contacto, y no clasifica, predice ni diagnostica a estudiantes, si no escribes nada te dice qué indica la normativa para esta situación.",
    boton: "Preguntar a CONVI IA",
    pendiente: "Revisando la situación…",
    aviso:
      "Respuesta generada con IA a partir de la situación y la normativa publicada: es un apoyo para revisar con sus fuentes, no decide ni cambia la situación, y la revisión normativa la registras tú.",
    hechos: "Hechos de la situación",
  },
} as const;

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

// Revisión de una situación: aviso destacado de que la IA no decide.
const TITULO_AVISO_SITUACION = "CONVI IA es una ayuda, no tiene la última palabra";

/**
 * Revisión de una situación: la respuesta como texto plano para copiarla, con
 * las fuentes de cada parte y el aviso al final. Usa los seudónimos que se ven
 * en pantalla, nunca los nombres reales.
 */
function textoParaCopiar(
  r: Orientacion,
  pregunta: string | undefined,
  aviso: string,
) {
  const porId = new Map(r.referencias.map((x) => [x.id, x]));
  const fuentes = (ids: string[]) => {
    const etiquetas = ids
      .map((id) => porId.get(id)?.etiqueta)
      .filter((e): e is string => Boolean(e));
    return etiquetas.length ? ` (${etiquetas.join(", ")})` : "";
  };
  const lineas: string[] = ["Respuesta de CONVI IA"];
  if (pregunta) lineas.push(`Pregunta: ${pregunta}`);
  if (r.respuesta) {
    lineas.push("", `${r.respuesta.texto}${fuentes(r.respuesta.referencias)}`);
  } else if (r.texto_sin_disposicion && (r.fuera_de_limite || r.sin_disposicion)) {
    lineas.push("", r.texto_sin_disposicion);
  }
  if (!r.fuera_de_limite && r.pasos.length > 0) {
    lineas.push("", pregunta ? "Pasos relacionados:" : "Lo que indica la normativa:");
    r.pasos.forEach((p, i) =>
      lineas.push(`${i + 1}. ${p.texto}${fuentes(p.referencias)}`),
    );
  }
  if (!r.fuera_de_limite && r.hechos.length > 0) {
    lineas.push("", "Hechos de la situación considerados:");
    r.hechos.forEach((h) => lineas.push(`- ${h.texto}${fuentes(h.referencias)}`));
  }
  lineas.push("", `${TITULO_AVISO_SITUACION}: ${aviso}`);
  return lineas.join("\n");
}

/**
 * PB-120 y PB-121 (HU-103): orientación con IA dentro del expediente. Separa los
 * hechos documentados de los pasos que indica la normativa, con sus fuentes, y se
 * presenta como apoyo revisable (PB-148): no cambia el caso ni decide nada.
 */
export function OrientacionCaso({ casoId }: { casoId: string }) {
  return (
    <OrientacionIA ambito="caso" orientar={orientarCaso.bind(null, casoId)} />
  );
}

/**
 * CONVI IA en la pestaña Revisión de una situación: lo que indica la normativa,
 * con sus fuentes. Con "Usar en la revisión normativa" la respuesta pasa al
 * formulario, que queda marcado como asistido por IA y lo guarda la persona.
 */
export function OrientacionSituacion({
  situacionId,
  alUsar,
}: {
  situacionId: string;
  alUsar?: (resultado: Orientacion) => void;
}) {
  return (
    <OrientacionIA
      ambito="situacion"
      orientar={orientarSituacion.bind(null, situacionId)}
      alUsar={alUsar}
    />
  );
}

function OrientacionIA({
  ambito,
  orientar,
  alUsar,
}: {
  ambito: keyof typeof TEXTOS;
  orientar: (
    anterior: EstadoOrientacion,
    formData: FormData,
  ) => Promise<EstadoOrientacion>;
  alUsar?: (resultado: Orientacion) => void;
}) {
  const textos = TEXTOS[ambito];
  const [estado, accion, pendiente] = useActionState(orientar, estadoInicial);
  const [paso, setPaso] = useState(0);
  const pregunta = useRef<HTMLTextAreaElement>(null);
  const respuesta = useRef<HTMLDivElement>(null);
  const resultado = estado.resultado;
  // Resultado de la última copia, ligado a la respuesta que se copió.
  const [copia, setCopia] = useState<{ id: string; ok: boolean } | null>(null);

  const copiar = async () => {
    if (!resultado) return;
    const id = resultado.solicitud_id;
    try {
      await navigator.clipboard.writeText(
        textoParaCopiar(resultado, estado.pregunta, textos.aviso),
      );
      setCopia({ id, ok: true });
    } catch {
      setCopia({ id, ok: false });
    }
    setTimeout(
      () => setCopia((actual) => (actual?.id === id ? null : actual)),
      4000,
    );
  };

  // PB-136: el botón se desactiva mientras la IA responde y el foco se
  // perdía, al llegar la respuesta el foco va a ella y el lector la anuncia.
  useEffect(() => {
    if (resultado && !pendiente) respuesta.current?.focus();
  }, [resultado, pendiente]);

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
    reposo: textos.reposo,
    buscando: textos.buscando,
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

      <FormularioConCarga action={accion} onSubmit={() => setPaso(0)} className="space-y-3">
        {textos.sugerencias.length > 0 && (
        <fieldset disabled={pendiente} className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">
            Puedes comenzar con una de estas preguntas
          </legend>
          {textos.sugerencias.map((texto) => (
            <button
              key={texto}
              type="button"
              onClick={() => {
                if (pregunta.current) {
                  pregunta.current.value = texto;
                  pregunta.current.focus();
                }
              }}
              className="min-h-11 rounded-xl border border-border px-4 py-3 text-left text-sm text-primary transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            >
              {texto}
            </button>
          ))}
        </fieldset>
        )}
        <div>
          <label
            htmlFor="pregunta-orientacion"
            className="block text-sm font-medium"
          >
            {textos.etiqueta}
          </label>
          <textarea
            ref={pregunta}
            id="pregunta-orientacion"
            name="pregunta"
            key={estado.pregunta ?? ""}
            defaultValue={estado.pregunta}
            maxLength={LARGO_MAXIMO}
            rows={2}
            placeholder={textos.ejemplo}
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
            {estado.errores?.pregunta ?? textos.ayuda}
          </p>
        </div>
        {estado.mensaje && !estado.errores && (
          <AvisoError>{estado.mensaje}</AvisoError>
        )}
        <div className="sm:w-64">
          <BotonEnviar
            pendiente={pendiente}
            textoPendiente={textos.pendiente}
          >
            {textos.boton}
          </BotonEnviar>
        </div>
      </FormularioConCarga>

      {resultado && !pendiente && (
        <div
          ref={respuesta}
          role="region"
          aria-label="Respuesta de CONVI IA"
          tabIndex={-1}
          className="space-y-4 border-t border-border pt-4 outline-none"
        >
          {ambito === "situacion" ? (
            <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
              <div className="flex min-w-64 flex-1 gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5v5M12 16.5h.01" />
                </svg>
                <div>
                  <p className="font-semibold text-destructive">
                    {TITULO_AVISO_SITUACION}
                  </p>
                  <p className="mt-0.5 text-foreground">{textos.aviso}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span role="status" className="text-sm text-muted-foreground">
                  {copia?.id === resultado.solicitud_id
                    ? copia.ok
                      ? "Respuesta copiada"
                      : "No se pudo copiar, selecciona el texto y cópialo a mano"
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={copiar}
                  className={`${claseBotonSecundario} gap-2`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                  </svg>
                  Copiar respuesta
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              {textos.aviso}
            </p>
          )}

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
                    {textos.hechos} considerados
                  </summary>
                  <Lista elementos={resultado.hechos} porId={porId} />
                </details>
              )}
            </>
          ) : (
            <>
              {resultado.hechos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">{textos.hechos}</h3>
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

          {/* Revisión de una situación: la respuesta pasa al formulario de abajo. */}
          {alUsar &&
            !resultado.fuera_de_limite &&
            (resultado.respuesta || resultado.pasos.length > 0) && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent-foreground/15 bg-accent px-4 py-3">
                <p className="flex-1 text-sm text-accent-foreground">
                  ¿Te sirve? Pásala a la revisión normativa, quedará marcada
                  como asistida por IA y la revisas antes de guardar
                </p>
                <button
                  type="button"
                  onClick={() => alUsar(resultado)}
                  className={claseBotonSecundario}
                >
                  Usar en la revisión normativa
                </button>
              </div>
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
