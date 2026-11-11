"use client";

import { useId, useRef, useState, useTransition } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import {
  crearEnlaceCalendario,
  desactivarEnlaceCalendario,
  type EstadoEnlace,
} from "./acciones";

export type EstadoSuscripcion = {
  activa: boolean;
  creada_en: string | null;
  consultada_en: string | null;
};

const claseBotonPanel =
  "presion inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Refinamientos de Convivencia, sección 5: suscribir el calendario desde
 * Google Calendar con un enlace privado. El panel explica qué datos salen de
 * CONVI, muestra el enlace una sola vez al crearlo y permite desactivarlo.
 * Usa el mismo panel lateral que los eventos del día.
 */
export function SuscripcionCalendario({
  estado,
  zonaHoraria,
}: {
  estado: EstadoSuscripcion;
  zonaHoraria: string;
}) {
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const [resultado, setResultado] = useState<EstadoEnlace>({});
  const [copiado, setCopiado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  // El enlace solo existe después de crearlo, en el navegador, con la misma
  // dirección de CONVI que usa la persona.
  const origen = typeof window === "undefined" ? "" : window.location.origin;
  const enlace = resultado.codigo ? `${origen}/calendario/${resultado.codigo}.ics` : null;
  const activa = resultado.codigo ? true : resultado.desactivado ? false : estado.activa;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origen);
  const fecha = (valor: string) =>
    new Intl.DateTimeFormat("es-CL", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: zonaHoraria,
    }).format(new Date(valor));

  const cerrar = () => dialogo.current?.close();
  const ejecutar = (accion: () => Promise<EstadoEnlace>) =>
    iniciar(async () => {
      setCopiado(false);
      setResultado(await accion());
    });
  const copiar = async () => {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogo.current?.showModal()}
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
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18M12 14v4M10 16h4" />
        </svg>
        Ver en Google Calendar
        {activa && <span className="sr-only">, enlace activo</span>}
      </button>

      <dialog
        ref={dialogo}
        id={id}
        aria-labelledby={`${id}-titulo`}
        onClose={() => {
          setResultado((r) => (r.codigo ? { ...r, codigo: undefined } : r));
          setCopiado(false);
          boton.current?.focus();
        }}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) cerrar();
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(30rem,calc(100%-3rem))] max-w-none translate-x-full overflow-y-auto border-0 border-l border-border bg-card p-0 text-foreground shadow-xl transition-[translate,overlay,display] transition-discrete duration-[420ms] ease-resorte backdrop:bg-foreground/35 backdrop:opacity-0 backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-300 open:translate-x-0 open:backdrop:opacity-100 starting:open:translate-x-full starting:open:backdrop:opacity-0"
      >
        <div className="sticky top-0 flex items-start gap-3 border-b border-border bg-card px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-titulo`} className="font-titulo text-xl font-semibold">
              Ver en Google Calendar
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {activa ? "Tienes un enlace activo" : "Sin enlace activo"}
            </p>
          </div>
          <button type="button" onClick={cerrar} className={claseBotonPanel}>
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            Cerrar
          </button>
        </div>

        <div className="space-y-6 px-5 py-5 text-sm">
          <p>
            Agrega este calendario a tu Google Calendar con un enlace privado,
            Google lo revisa solo cada algunas horas, así que un cambio en CONVI
            puede tardar en verse allá
          </p>

          <section aria-labelledby={`${id}-datos`} className="rounded-2xl border border-border p-4">
            <h3 id={`${id}-datos`} className="font-semibold">
              Qué recibe Google
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>El tipo de evento y el código del caso, por ejemplo «Seguimiento del caso CAS-00012»</li>
              <li>La fecha, la hora y si ya se realizó</li>
              <li>Un enlace a CONVI, que pide iniciar sesión para ver el detalle</li>
            </ul>
            <p className="mt-2">
              Nunca recibe nombres de estudiantes, títulos ni descripciones
            </p>
          </section>

          {enlace ? (
            <section aria-labelledby={`${id}-enlace`} className="space-y-3">
              <h3 id={`${id}-enlace`} className="font-semibold">
                Tu enlace
              </h3>
              <label htmlFor={`${id}-url`} className="sr-only">
                Enlace privado del calendario
              </label>
              <input
                id={`${id}-url`}
                readOnly
                value={enlace}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-input bg-muted px-3 py-2 font-mono text-xs"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={copiar} className={claseBotonPrimario}>
                  Copiar enlace
                </button>
                <span role="status" className="text-muted-foreground">
                  {copiado ? "Enlace copiado" : ""}
                </span>
              </div>
              <p className="rounded-lg border border-amarillo/40 bg-amarillo/10 px-3 py-2.5">
                Cópialo ahora, por seguridad CONVI no lo vuelve a mostrar, quien
                tenga este enlace ve estas fechas, así que no lo compartas
              </p>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>
                  Abre{" "}
                  <a
                    href="https://calendar.google.com/calendar/r/settings/addbyurl"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Google Calendar, agregar desde URL
                    <span className="sr-only"> (se abre en otra pestaña)</span>
                  </a>
                </li>
                <li>Pega el enlace en «URL del calendario»</li>
                <li>Presiona «Agregar calendario», aparece como «CONVI Convivencia»</li>
              </ol>
              {local && (
                <p className="text-muted-foreground">
                  Estás en un entorno local: Google no puede leer un enlace de
                  localhost, en la versión publicada funciona igual, aquí puedes
                  abrir el enlace para descargar el archivo y revisarlo
                </p>
              )}
            </section>
          ) : (
            activa &&
            !resultado.codigo && (
              <dl className="space-y-2">
                {estado.creada_en && !resultado.desactivado && (
                  <div>
                    <dt className="text-muted-foreground">Creado el</dt>
                    <dd>{fecha(estado.creada_en)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Última consulta de Google</dt>
                  <dd>
                    {estado.consultada_en
                      ? fecha(estado.consultada_en)
                      : "Todavía no lo consulta"}
                  </dd>
                </div>
              </dl>
            )
          )}

          {resultado.desactivado && (
            <p role="status" className="rounded-lg border border-border bg-muted px-3 py-2.5">
              El enlace quedó desactivado, Google deja de recibir las fechas en
              su próxima revisión, puedes quitar el calendario de Google
            </p>
          )}
          {resultado.mensaje && <AvisoError>{resultado.mensaje}</AvisoError>}

          <div className="flex flex-wrap gap-3 border-t border-border pt-5">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(crearEnlaceCalendario)}
              className={claseBotonPrimario}
            >
              {pendiente ? "Un momento…" : activa ? "Crear un enlace nuevo" : "Crear enlace"}
            </button>
            {activa && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => ejecutar(desactivarEnlaceCalendario)}
                className={`${claseBotonSecundario} text-destructive`}
              >
                Desactivar enlace
              </button>
            )}
          </div>
          {activa && (
            <p className="text-xs text-muted-foreground">
              Un enlace nuevo reemplaza al anterior, que deja de funcionar, úsalo
              si perdiste el enlace o crees que alguien más lo tiene
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
