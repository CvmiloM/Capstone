"use client";

import { useEffect } from "react";

/**
 * Las partes de cada sección (título, texto, imagen) entran una tras otra la
 * primera vez que se ven: suben 28 px y aparecen. Lo que ya está en pantalla
 * al cargar no se esconde, y sin JavaScript todo se ve igual. El retraso de
 * cada parte lo da su data-entra (0 a 3), en landing.css.
 */
export function EntradasAlBajar() {
  useEffect(() => {
    const partes = [...document.querySelectorAll<HTMLElement>("[data-entra]")];
    const pendientes = partes.filter(
      (parte) => parte.getBoundingClientRect().top > window.innerHeight * 0.9,
    );
    for (const parte of pendientes) parte.dataset.estado = "espera";

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          (entrada.target as HTMLElement).dataset.estado = "entro";
          observador.unobserve(entrada.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    for (const parte of pendientes) observador.observe(parte);
    return () => observador.disconnect();
  }, []);

  return null;
}