"use client";

import { FormularioConCarga } from "@/app/components/actividad";

import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  AvisoError,
  BotonEnviar,
  claseEnlace,
} from "@/app/components/formulario";
import {
  consultarReglamento,
  type Cita,
  type EstadoConsulta,
} from "./acciones";
import { MascotaIA, type FaseMascota } from "./mascota-ia";

// La consulta es una sola llamada, así que las fases mientras espera son una guía
// visual por tiempo: busca, después piensa y escribe hasta que llega la respuesta.
const FASES_ESPERA = ["buscando", "pensando", "escribiendo"] as const;

const estadoInicial: EstadoConsulta = {};
const LARGO_MAXIMO = 1000;

// Refinamientos de Convivencia, sección 10.1: preguntas frecuentes con una
// parte entre corchetes que se completa, sin datos de estudiantes.
const EJEMPLOS = [
  "¿Qué procedimiento establece el reglamento para [tipo de situación]?",
  "¿Qué medidas contempla el reglamento ante [tipo de falta]?",
  "¿Qué pasos y plazos tiene el protocolo de [nombre del protocolo]?",
  "¿Quién es responsable de [acción o etapa] según el reglamento?",
  "¿Cómo y cuándo se informa a la familia en caso de [tipo de situación]?",
  "¿Qué dice el reglamento sobre [tema]?",
];

function ubicacion(cita: Cita) {
  if (cita.pagina_desde === null) return "documento Word, sin página";
  return cita.pagina_hasta !== null && cita.pagina_hasta !== cita.pagina_desde
    ? `páginas ${cita.pagina_desde} a ${cita.pagina_hasta}`
    : `página ${cita.pagina_desde}`;
}

// El visor de PB-084 abre el PDF en la página citada.
function enlace(cita: Cita) {
  const base = `/convivencia/documentos/versiones/${encodeURIComponent(cita.version_id)}`;
  return cita.pagina_desde === null
    ? base
    : `${base}?pagina=${cita.pagina_desde}`;
}

/**
 * PB-117 a PB-119 (HU-101 y HU-102): consulta del reglamento con IA para Convivencia.
 * Cada pregunta es independiente, la respuesta muestra sus citas con documento,
 * versión y páginas, y se presenta como apoyo revisable (PB-148).
 */
export function ConsultaReglamento() {
  const [estado, accion, pendiente] = useActionState(
    consultarReglamento,
    estadoInicial,
  );
  const resultado = estado.resultado;
  const [paso, setPaso] = useState(0);
  const pregunta = useRef<HTMLTextAreaElement>(null);

  // Copia el ejemplo en la pregunta y deja seleccionada la parte entre
  // corchetes, así lo que se escribe la reemplaza.
  function usarEjemplo(texto: string) {
    const campo = pregunta.current;
    if (!campo) return;
    campo.value = texto;
    campo.focus();
    const inicio = texto.indexOf("[");
    const fin = texto.indexOf("]");
    if (inicio >= 0 && fin > inicio) campo.setSelectionRange(inicio, fin + 1);
  }

  useEffect(() => {
    if (!pendiente) return;
    const pensar = setTimeout(() => setPaso(1), 1200);
    const escribir = setTimeout(() => setPaso(2), 2800);
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

  return (
    <div className="space-y-6">
      <MascotaIA fase={fase} />
      <FormularioConCarga
        action={accion}
        onSubmit={() => setPaso(0)}
        className="space-y-4 rounded-2xl border border-border bg-card p-5"
      >
        <fieldset disabled={pendiente}>
          <legend className="text-sm font-medium">
            Preguntas de ejemplo
          </legend>
          <p id="ejemplos-ayuda" className="mt-1 text-sm text-muted-foreground">
            Elige una y completa la parte entre corchetes
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {EJEMPLOS.map((texto) => (
              <button
                key={texto}
                type="button"
                aria-describedby="ejemplos-ayuda"
                onClick={() => usarEjemplo(texto)}
                className="min-h-11 rounded-xl border border-border px-4 py-2.5 text-left text-sm text-primary transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              >
                {texto}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="pregunta" className="block text-sm font-medium">
            Tu pregunta
          </label>
          <textarea
            ref={pregunta}
            id="pregunta"
            name="pregunta"
            // Al responder, el campo conserva lo que se preguntó.
            key={estado.pregunta ?? ""}
            defaultValue={estado.pregunta}
            required
            minLength={5}
            maxLength={LARGO_MAXIMO}
            rows={3}
            placeholder="Por ejemplo: ¿qué debe hacer convivencia ante un caso de ciberacoso?"
            aria-invalid={estado.errores?.pregunta ? true : undefined}
            aria-describedby="pregunta-ayuda"
            className={`mt-1.5 block w-full resize-y rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/15 ${
              estado.errores?.pregunta ? "border-destructive" : "border-input"
            }`}
          />
          <p
            id="pregunta-ayuda"
            className={`mt-1.5 text-sm ${estado.errores?.pregunta ? "text-destructive" : "text-muted-foreground"}`}
          >
            {estado.errores?.pregunta ??
              "Pregunta por lo que dice el reglamento, sin nombres de estudiantes: la IA responde solo con los documentos publicados y vigentes de tu escuela."}
          </p>
        </div>
        {estado.mensaje && !estado.errores && (
          <AvisoError>{estado.mensaje}</AvisoError>
        )}
        <div className="sm:w-56">
          <BotonEnviar
            pendiente={pendiente}
            textoPendiente="Buscando en el reglamento…"
          >
            Consultar
          </BotonEnviar>
        </div>
      </FormularioConCarga>

      {resultado && !pendiente && (
        <section
          aria-live="polite"
          className="space-y-4 rounded-2xl border border-border bg-card p-5"
        >
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Respuesta generada con IA a partir del reglamento publicado de tu
            escuela: revísala con sus citas antes de usarla, porque no reemplaza
            al documento oficial.
          </p>
          {resultado.sin_disposicion ? (
            <div className="space-y-2">
              <h2 className="text-base font-semibold">
                El reglamento no regula esto
              </h2>
              <p className="text-sm">{resultado.respuesta}</p>
              <p className="text-sm">
                <Link href="/convivencia/documentos" className={claseEnlace}>
                  Ver los documentos institucionales
                </Link>
              </p>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-base font-semibold">Respuesta</h2>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">
                  {resultado.respuesta}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Fuentes citadas</h3>
                <ol className="mt-2 space-y-3">
                  {resultado.citas.map((cita) => (
                    <li
                      key={cita.numero}
                      className="rounded-lg border border-border p-3 text-sm"
                    >
                      <p className="font-medium">
                        [{cita.numero}] {cita.documento}, versión {cita.version}
                        , {ubicacion(cita)}
                      </p>
                      <blockquote className="mt-1.5 border-l-2 border-border pl-3 text-muted-foreground">
                        {cita.extracto}
                      </blockquote>
                      <Link
                        href={enlace(cita)}
                        className={`mt-2 inline-block ${claseEnlace}`}
                      >
                        {cita.pagina_desde === null
                          ? "Abrir el documento"
                          : "Abrir en esa página"}
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
