"use client";

import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { useEffect, useId, useRef, useState } from "react";
import {
  BORDE,
  DIAS_SEMANA,
  diasEntre,
  enlaceOrigen,
  ESTADOS,
  type Evento,
  nombreDia,
  nombreTipo,
} from "./eventos";

/** Cuántos eventos caben en cada día de la grilla, el resto se ve en el panel. */
const POR_DIA = 3;

const claseBotonPanel =
  "presion inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Refinamientos de Convivencia, sección 5: la grilla del mes y, al elegir un
 * día, un panel lateral derecho con todos sus eventos, en vez de la lista
 * larga del mes bajo el calendario. El panel es un <dialog> modal: el foco
 * queda adentro, Escape o Cerrar lo cierran y el foco vuelve al día elegido.
 * Los eventos ya vienen en la respuesta del mes, así que abrirlo no pide nada
 * más a la API.
 */
export function GrillaCalendario({
  eventos,
  desde,
  hasta,
  hoy,
  mes,
}: {
  eventos: Evento[];
  desde: string;
  hasta: string;
  hoy: string;
  mes: string;
}) {
  const [dia, setDia] = useState<string | null>(null);
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const botonCerrar = useRef<HTMLButtonElement>(null);
  // El botón que abrió el panel, para devolverle el foco al cerrarlo.
  const origen = useRef<HTMLElement | null>(null);

  const porDia = new Map<string, Evento[]>();
  for (const e of eventos) porDia.set(e.dia, [...(porDia.get(e.dia) ?? []), e]);
  const delDia = dia ? (porDia.get(dia) ?? []) : [];

  const abrir = (elegido: string, boton: HTMLElement | null) => {
    origen.current = boton;
    setDia(elegido);
    const panel = dialogo.current;
    if (panel && !panel.open) panel.showModal();
    botonCerrar.current?.focus();
  };
  const alCerrarse = () => {
    if (dialogo.current?.open) return;
    setDia(null);
    origen.current?.focus();
  };
  const cerrar = () => {
    dialogo.current?.close();
    alCerrarse();
  };

  useEffect(() => {
    if (!dia) return;
    // La página de atrás no se desplaza mientras el panel está abierto.
    const raiz = document.documentElement;
    const desplazamiento = raiz.style.overflow;
    raiz.style.overflow = "hidden";
    return () => {
      raiz.style.overflow = desplazamiento;
    };
  }, [dia]);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-tarjeta">
        <div
          aria-hidden="true"
          className="grid grid-cols-7 border-b border-border bg-muted/60 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {diasEntre(desde, hasta).map((d, i) => {
            const lista = porDia.get(d) ?? [];
            const fuera = !d.startsWith(mes);
            const esHoy = d === hoy;
            return (
              <div
                key={d}
                // Con el mouse, tocar cualquier parte del día abre su panel,
                // salvo un evento, que abre su registro.
                onClick={(evento) => {
                  if (
                    evento.target instanceof Element &&
                    evento.target.closest("a[href], button")
                  )
                    return;
                  abrir(d, evento.currentTarget.querySelector("button"));
                }}
                className={`min-h-32 cursor-pointer border-border p-2 transition-colors hover:bg-muted/40 ${i % 7 !== 6 ? "border-r" : ""} ${
                  i >= 7 ? "border-t" : ""
                } ${fuera ? "bg-muted/30" : ""}`}
              >
                <div className="mb-1 flex justify-end">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-controls={id}
                    onClick={(evento) => abrir(d, evento.currentTarget)}
                    className={`presion inline-flex size-7 items-center justify-center rounded-full text-sm focus-visible:outline-2 focus-visible:outline-ring ${
                      esHoy
                        ? "bg-primary font-semibold text-primary-foreground"
                        : fuera
                          ? "text-muted-foreground/60 hover:bg-muted"
                          : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span aria-hidden="true">{Number(d.slice(8))}</span>
                    <span className="sr-only">
                      {esHoy ? "Hoy, " : ""}
                      {nombreDia(d)}, {lista.length === 1 ? "1 evento" : `${lista.length} eventos`}
                    </span>
                  </button>
                </div>
                {/* Sin eventos no hay lista, así el lector no anuncia listas vacías. */}
                {lista.length > 0 && (
                  <ul className="space-y-1">
                    {lista.slice(0, POR_DIA).map((e) => (
                      <li key={`${e.tipo}-${e.origen_id}`}>
                        <Chip evento={e} />
                      </li>
                    ))}
                  </ul>
                )}
                {lista.length > POR_DIA && (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-controls={id}
                    onClick={(evento) => abrir(d, evento.currentTarget)}
                    className="mt-1 block text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    +{lista.length - POR_DIA}
                    <span className="sr-only"> eventos más el {nombreDia(d)}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <dialog
        ref={dialogo}
        id={id}
        aria-labelledby={`${id}-titulo`}
        onClose={alCerrarse}
        onClick={(evento) => {
          // Tocar el fondo, fuera del panel, lo cierra.
          if (evento.target === evento.currentTarget) cerrar();
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(28rem,calc(100%-3rem))] max-w-none translate-x-full overflow-y-auto border-0 border-l border-border bg-card p-0 text-foreground shadow-xl transition-[translate,overlay,display] transition-discrete duration-[420ms] ease-resorte backdrop:bg-foreground/35 backdrop:opacity-0 backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-300 open:translate-x-0 open:backdrop:opacity-100 starting:open:translate-x-full starting:open:backdrop:opacity-0"
      >
        <div className="sticky top-0 flex items-start gap-3 border-b border-border bg-card px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-titulo`} className="font-titulo text-xl font-semibold first-letter:uppercase">
              {dia ? nombreDia(dia) : ""}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {dia === hoy && "Hoy, "}
              {delDia.length === 1 ? "1 evento" : `${delDia.length} eventos`}
            </p>
          </div>
          <button
            ref={botonCerrar}
            type="button"
            onClick={cerrar}
            className={claseBotonPanel}
          >
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
        <div className="px-5 py-4">
          {delDia.length === 0 ? (
            <p className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">
              No hay eventos este día con los tipos elegidos
            </p>
          ) : (
            <ul className="space-y-2">
              {delDia.map((e) => (
                <li key={`${e.tipo}-${e.origen_id}`}>
                  <Fila evento={e} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}

/** Evento corto dentro de la grilla. */
function Chip({ evento: e }: { evento: Evento }) {
  const destino = enlaceOrigen(e);
  const clase = `block truncate rounded-md border-l-4 px-2 py-1 text-xs ${BORDE[e.tipo]} ${
    e.vencido
      ? "bg-destructive/10 text-destructive"
      : e.terminado
        ? "bg-muted/60 text-muted-foreground line-through"
        : "bg-muted/60"
  }`;
  const texto = (
    <>
      {e.hora !== "00:00" && <span className="font-medium">{e.hora} </span>}
      {e.titulo}
    </>
  );
  const titulo = `${nombreTipo(e)}: ${e.titulo}`;
  return destino ? (
    <Link
      href={destino}
      title={titulo}
      className={`${clase} presion transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring`}
    >
      {texto}
    </Link>
  ) : (
    <span title={titulo} className={clase}>
      {texto}
    </span>
  );
}

/** Evento completo en el panel del día, con el enlace a su registro. */
function Fila({ evento: e }: { evento: Evento }) {
  const destino = enlaceOrigen(e);
  const contenido = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className={`font-medium ${e.terminado ? "line-through" : ""}`}>
          {e.hora !== "00:00" && <span className="tabular-nums">{e.hora} </span>}
          {e.titulo}
        </span>
        <span className="flex gap-2">
          {e.vencido && (
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs text-destructive">
              Fecha pasada
            </span>
          )}
          <span className="rounded-full bg-muted px-3 py-1 text-xs">
            {ESTADOS[e.estado] ?? e.estado}
          </span>
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {nombreTipo(e)}
        {e.hora_fin &&
          (e.dia_fin === e.dia ? `, hasta las ${e.hora_fin}` : `, hasta el ${e.dia_fin} ${e.hora_fin}`)}
        {e.caso_codigo && `, caso ${e.caso_codigo}`}
        {e.plan_nombre && `, Plan ${e.plan_nombre}`}
        {e.objetivo_plan && `, objetivo ${e.objetivo_plan}`}
        {e.accion_plan && `, acción ${e.accion_plan}`}
      </p>
    </>
  );
  const clase = `block rounded-2xl border border-l-4 border-border bg-card p-4 ${BORDE[e.tipo]}`;
  return destino ? (
    <Link
      href={destino}
      className={`${clase} transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring`}
    >
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}
