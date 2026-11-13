"use client";

import { useEffect } from "react";

/** Protege la edición local sin almacenar datos del informe en el navegador. */
// shortcut: Atrás/Adelante entre rutas cliente no dispara beforeunload; ampliar al disponer de un bloqueo de navegación estable en Next.
export function useCambiosSinGuardar(cambiado: boolean, enviando: boolean) {
  useEffect(() => {
    if (!cambiado || enviando) return;
    const alSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const alNavegar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const enlace = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(enlace instanceof HTMLAnchorElement) || enlace.target === "_blank" || enlace.hasAttribute("download")) return;
      const destino = new URL(enlace.href);
      if (destino.pathname === location.pathname && destino.search === location.search) return;
      if (!window.confirm("Tienes cambios sin guardar en el informe. ¿Quieres salir y descartarlos?")) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", alSalir);
    document.addEventListener("click", alNavegar, true);
    return () => {
      window.removeEventListener("beforeunload", alSalir);
      document.removeEventListener("click", alNavegar, true);
    };
  }, [cambiado, enviando]);
}
