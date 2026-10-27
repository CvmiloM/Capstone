"use client";

import Link from "next/link";
import { useActionState } from "react";
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

const estadoInicial: EstadoConsulta = {};
const LARGO_MAXIMO = 1000;

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

  return (
    <div className="space-y-6">
      <form
        action={accion}
        className="space-y-4 rounded-2xl border border-border bg-card p-5"
      >
        <div>
          <label htmlFor="pregunta" className="block text-sm font-medium">
            Tu pregunta
          </label>
          <textarea
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
              "Pregunta por lo que dice el reglamento, sin nombres de estudiantes: la IA responde solo con el reglamento publicado y vigente de tu escuela."}
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
      </form>

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
