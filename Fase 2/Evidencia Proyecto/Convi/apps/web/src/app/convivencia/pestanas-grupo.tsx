"use client";

import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

// Pantallas que comparten una entrada del menú lateral de Convivencia. Cada
// una conserva su dirección, así los enlaces de alertas, avisos y correos
// siguen funcionando, y se cambia entre ellas con estas pestañas.
export const GRUPOS = {
  agenda: {
    etiqueta: "Calendario y agenda",
    pestanas: [
      { href: "/convivencia/calendario", texto: "Calendario" },
      { href: "/convivencia/seguimientos", texto: "Agenda de seguimientos" },
    ],
  },
  consultas: {
    etiqueta: "Indicadores e informes",
    pestanas: [
      { href: "/convivencia/indicadores", texto: "Indicadores" },
      { href: "/convivencia/informes", texto: "Informes" },
    ],
  },
  expedientes: {
    etiqueta: "Expedientes",
    pestanas: [
      { href: "/convivencia/expedientes", texto: "Buscar expedientes" },
      { href: "/convivencia/estudiantes", texto: "Historial de estudiantes" },
      { href: "/convivencia/historico", texto: "Registro histórico" },
    ],
  },
} as const;

/**
 * Pestañas entre las pantallas de un grupo, con el mismo resaltado que se
 * desliza con resorte del menú lateral y de la ficha del caso.
 */
export function PestanasGrupo({
  grupo,
  className = "mb-6",
}: {
  grupo: keyof typeof GRUPOS;
  /** Margen inferior, vacío cuando la página ya separa sus bloques. */
  className?: string;
}) {
  const { etiqueta, pestanas } = GRUPOS[grupo];
  const ruta = usePathname();
  const marcada = pestanas.findIndex(
    (p) => ruta === p.href || ruta.startsWith(`${p.href}/`),
  );

  const barra = useRef<HTMLElement>(null);
  const marca = useRef<HTMLSpanElement>(null);

  // La primera vez el resaltado aparece en su lugar, después se desliza.
  useLayoutEffect(() => {
    const nav = barra.current;
    const span = marca.current;
    if (!nav || !span) return;
    const ubicar = () => {
      const enlace = nav.querySelector<HTMLElement>(
        `[data-indice="${marcada}"]`,
      );
      if (!enlace) {
        span.style.opacity = "0";
        return;
      }
      span.style.width = `${enlace.offsetWidth}px`;
      span.style.height = `${enlace.offsetHeight}px`;
      span.style.translate = `${enlace.offsetLeft}px ${enlace.offsetTop}px`;
      span.style.opacity = "1";
    };
    ubicar();
    if (nav.dataset.resaltado !== "listo") {
      requestAnimationFrame(() => {
        nav.dataset.resaltado = "listo";
      });
    }
    const observador = new ResizeObserver(ubicar);
    observador.observe(nav);
    return () => observador.disconnect();
  }, [marcada]);

  return (
    <nav
      ref={barra}
      aria-label={etiqueta}
      className={`group relative flex gap-1 border-b border-border pb-3 ${className}`}
    >
      <span
        ref={marca}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 rounded-xl bg-primary opacity-0 group-data-[resaltado=listo]:transition-[translate,width,height,opacity] group-data-[resaltado=listo]:duration-[420ms] group-data-[resaltado=listo]:ease-resorte"
      />
      {pestanas.map((p, indice) => (
        <Link
          key={p.href}
          href={p.href}
          anticipar
          data-indice={indice}
          data-direccion={indice > marcada ? "adelante" : "atras"}
          aria-current={indice === marcada ? "page" : undefined}
          className={`presion relative min-h-11 shrink-0 rounded-xl px-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${
            indice === marcada
              ? "bg-primary font-semibold text-primary-foreground group-data-[resaltado=listo]:bg-transparent"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
