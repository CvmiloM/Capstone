"use client";

import { useEffect, useId, useRef } from "react";
import { claseBotonPrimario, claseBotonSecundario } from "../formulario";

function rutaDe(url: URL | Location) {
  return url.origin + url.pathname + url.search;
}

export function AvisoRespuestaIA({ activo }: { activo: boolean }) {
  const titulo = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const salir = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!activo) return;
    const modal = dialogo.current;
    // shortcut: Sin Navigation API se omite Atrás entre vistas de la misma página hasta que el navegador la implemente.
    const navegacion = (window as Window & {
      navigation?: EventTarget & { currentEntry: { index: number } | null };
    }).navigation;
    let indice = navegacion?.currentEntry?.index;
    let ruta = rutaDe(location);
    let confirmarDespuesDeRestaurar: (() => void) | null = null;
    let continuar = false;
    let permitirHistorial = false;
    let temporizador: number | undefined;

    const alCerrar = (evento: BeforeUnloadEvent) => {
      if (continuar) return;
      evento.preventDefault();
      evento.returnValue = "";
    };
    const pedirConfirmacion = (accion: () => void) => {
      if (!modal || modal.open) return;
      salir.current = () => {
        continuar = true;
        temporizador = window.setTimeout(() => { continuar = false; }, 0);
        accion();
      };
      modal.showModal();
    };
    const detener = (evento: Event) => {
      evento.preventDefault();
      evento.stopPropagation();
    };
    const alAbrirEnlace = (evento: MouseEvent) => {
      if (continuar || evento.defaultPrevented || evento.button !== 0 ||
        evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return;
      const enlace = evento.target instanceof Element
        ? evento.target.closest<HTMLAnchorElement>("a[href]")
        : null;
      if (!enlace || enlace.hasAttribute("download") ||
        (enlace.target && enlace.target.toLowerCase() !== "_self")) return;
      const url = new URL(enlace.href);
      if (!["http:", "https:"].includes(url.protocol) || rutaDe(url) === ruta) return;
      detener(evento);
      pedirConfirmacion(() => enlace.click());
    };
    const alEnviar = (evento: SubmitEvent) => {
      const formulario = evento.target;
      if (continuar || evento.defaultPrevented || !(formulario instanceof HTMLFormElement)) return;
      if (formulario.method !== "get" && !formulario.hasAttribute("data-cerrar-sesion")) return;
      detener(evento);
      pedirConfirmacion(() => formulario.requestSubmit(evento.submitter));
    };
    const alCambiarEntrada = (evento: Event) => {
      const tipo = (evento as Event & { navigationType?: string }).navigationType;
      const actual = navegacion?.currentEntry?.index;
      if (tipo === "traverse" || (tipo === "replace" && actual !== indice)) return;
      indice = actual;
      ruta = rutaDe(location);
    };
    const alNavegar = (evento: Event) => {
      const { navigationType, destination } = evento as Event & {
        navigationType?: string;
        destination?: { url: string; index: number; sameDocument: boolean };
      };
      if (permitirHistorial || navigationType !== "traverse" || !evento.cancelable ||
        !destination?.sameDocument || indice === undefined || indice < 0 ||
        destination.index < 0 || rutaDe(new URL(destination.url)) === ruta) return;
      evento.preventDefault();
      const diferencia = destination.index - indice;
      pedirConfirmacion(() => {
        permitirHistorial = true;
        history.go(diferencia);
      });
    };
    const alVolver = (evento: PopStateEvent) => {
      const actual = navegacion?.currentEntry?.index;
      if (confirmarDespuesDeRestaurar) {
        evento.stopImmediatePropagation();
        const confirmar = confirmarDespuesDeRestaurar;
        confirmarDespuesDeRestaurar = null;
        confirmar();
        return;
      }
      if (!permitirHistorial && rutaDe(location) !== ruta && actual !== undefined && indice !== undefined &&
        actual >= 0 && indice >= 0 && actual !== indice) {
        // Atrás ya movió el historial. Volvemos a la entrada original antes de mostrar el diálogo.
        evento.stopImmediatePropagation();
        const diferencia = actual - indice;
        confirmarDespuesDeRestaurar = () => pedirConfirmacion(() => {
          permitirHistorial = true;
          history.go(diferencia);
        });
        history.go(-diferencia);
        return;
      }
      permitirHistorial = false;
      indice = actual;
      ruta = rutaDe(location);
    };

    document.addEventListener("click", alAbrirEnlace, true);
    document.addEventListener("submit", alEnviar, true);
    window.addEventListener("beforeunload", alCerrar);
    window.addEventListener("popstate", alVolver, true);
    navegacion?.addEventListener("navigate", alNavegar);
    navegacion?.addEventListener("currententrychange", alCambiarEntrada);
    return () => {
      window.clearTimeout(temporizador);
      document.removeEventListener("click", alAbrirEnlace, true);
      document.removeEventListener("submit", alEnviar, true);
      window.removeEventListener("beforeunload", alCerrar);
      window.removeEventListener("popstate", alVolver, true);
      navegacion?.removeEventListener("navigate", alNavegar);
      navegacion?.removeEventListener("currententrychange", alCambiarEntrada);
      modal?.close();
      salir.current = null;
    };
  }, [activo]);

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={titulo}
      aria-describedby={`${titulo}-descripcion`}
      onClose={() => { salir.current = null; }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-foreground/35"
    >
      <h2 id={titulo} className="font-titulo text-xl font-semibold">¿Salir de la página?</h2>
      <p id={`${titulo}-descripcion`} className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Si sales de esta página, perderás la respuesta de la IA.
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" className={claseBotonSecundario} onClick={() => dialogo.current?.close()}>
          Seguir aquí
        </button>
        <button
          type="button"
          className={claseBotonPrimario}
          onClick={() => {
            const accion = salir.current;
            dialogo.current?.close();
            accion?.();
          }}
        >
          Salir de la página
        </button>
      </div>
    </dialog>
  );
}
