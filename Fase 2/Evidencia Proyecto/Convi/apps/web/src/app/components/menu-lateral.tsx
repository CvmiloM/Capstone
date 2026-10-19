"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icono, type NombreIcono } from "@/app/components/icono";

export type EnlaceMenu = {
  href: string;
  texto: string;
  icono: NombreIcono;
  /** Otras rutas en que este enlace también queda marcado. */
  tambien?: string[];
};

export type SeccionMenu = { titulo?: string; enlaces: EnlaceMenu[] };

// El inicio del portal (raiz) solo se marca en su propia página y en las
// rutas de "tambien"; los demás enlaces, también en sus subpáginas.
function estaActivo(ruta: string, enlace: EnlaceMenu, raiz: string) {
  const prefijos =
    enlace.href === raiz
      ? (enlace.tambien ?? [])
      : [enlace.href, ...(enlace.tambien ?? [])];
  return (
    ruta === enlace.href ||
    prefijos.some((p) => ruta === p || ruta.startsWith(`${p}/`))
  );
}

// Hacia dónde va una navegación que no sale del menú: entrar a un detalle
// es "adelante" y volver a la lista es "atras".
function direccionPorRuta(desde: string, hacia: string) {
  if (hacia.startsWith(`${desde}/`)) return "adelante";
  if (desde.startsWith(`${hacia}/`)) return "atras";
  return "fundido";
}

/**
 * Menú lateral común de los portales, al estilo de Apple:
 * - El resaltado azul es un solo elemento que se desliza con un resorte
 *   (--resorte, en globals.css) hasta la sección elegida apenas se hace
 *   clic, sin esperar a que cargue la página.
 * - Marca en <html data-navegacion> hacia dónde va cada navegación, para que
 *   el contenido entre desde ese lado (components/transicion-pagina.tsx).
 */
export function MenuLateral({
  etiqueta,
  raiz,
  secciones,
}: {
  etiqueta: string;
  raiz: string;
  secciones: SeccionMenu[];
}) {
  const ruta = usePathname();
  const enlaces = secciones.flatMap((s) => s.enlaces);
  const indiceRuta = enlaces.findIndex((e) => estaActivo(ruta, e, raiz));
  // El clic manda solo mientras siga la ruta de cuando se hizo.
  const [pulsado, setPulsado] = useState<{
    href: string;
    desde: string;
  } | null>(null);
  const indicePulsado =
    pulsado?.desde === ruta
      ? enlaces.findIndex((e) => e.href === pulsado.href)
      : -1;
  const resaltado = indicePulsado >= 0 ? indicePulsado : indiceRuta;

  const menu = useRef<HTMLElement>(null);
  const marca = useRef<HTMLSpanElement>(null);

  // Ubica el resaltado sobre el enlace elegido. La primera vez aparece en
  // su lugar sin animación; después se desliza.
  useLayoutEffect(() => {
    const nav = menu.current;
    const span = marca.current;
    if (!nav || !span) return;
    const ubicar = () => {
      const enlace = nav.querySelector<HTMLElement>(
        `[data-indice="${resaltado}"]`,
      );
      if (!enlace) {
        span.style.opacity = "0";
        return;
      }
      const a = enlace.getBoundingClientRect();
      const b = nav.getBoundingClientRect();
      span.style.width = `${a.width}px`;
      span.style.height = `${a.height}px`;
      span.style.translate = `${a.left - b.left + nav.scrollLeft}px ${a.top - b.top + nav.scrollTop}px`;
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
  }, [resaltado]);

  // Anota la dirección de la próxima navegación antes de que empiece.
  useEffect(() => {
    const raizHtml = document.documentElement;
    const alHacerClic = (evento: MouseEvent) => {
      const enlace =
        evento.target instanceof Element
          ? evento.target.closest("a[href]")
          : null;
      raizHtml.dataset.navegacion =
        enlace instanceof HTMLAnchorElement &&
        enlace.origin === window.location.origin
          ? (enlace.dataset.direccion ??
            direccionPorRuta(window.location.pathname, enlace.pathname))
          : "fundido";
    };
    const sinDireccion = () => {
      raizHtml.dataset.navegacion = "fundido";
    };
    document.addEventListener("click", alHacerClic, true);
    document.addEventListener("submit", sinDireccion, true);
    window.addEventListener("popstate", sinDireccion);
    return () => {
      document.removeEventListener("click", alHacerClic, true);
      document.removeEventListener("submit", sinDireccion, true);
      window.removeEventListener("popstate", sinDireccion);
    };
  }, []);

  return (
    <nav
      ref={menu}
      aria-label={etiqueta}
      className="group relative flex gap-1 overflow-x-auto px-3 pb-3 [view-transition-name:menu-lateral] lg:flex-col lg:gap-5 lg:overflow-visible lg:py-4"
    >
      {/* Un solo resaltado que se desliza, detrás del texto de los enlaces. */}
      <span
        ref={marca}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 rounded-lg bg-primary opacity-0 group-data-[resaltado=listo]:transition-[translate,width,height,opacity] group-data-[resaltado=listo]:duration-[420ms] group-data-[resaltado=listo]:ease-resorte"
      />
      {secciones.map(({ titulo, enlaces: grupo }) => (
        <div key={titulo ?? "secciones"} className="flex lg:block">
          {titulo && (
            <p className="hidden px-2.5 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:block">
              {titulo}
            </p>
          )}
          <ul className="flex gap-1 lg:flex-col lg:gap-0.5">
            {grupo.map((enlace) => {
              const indice = enlaces.indexOf(enlace);
              const marcado = indice === resaltado;
              return (
                <li key={enlace.href}>
                  <Link
                    href={enlace.href}
                    data-indice={indice}
                    data-direccion={
                      indice > indiceRuta
                        ? "abajo"
                        : indice < indiceRuta
                          ? "arriba"
                          : undefined
                    }
                    aria-current={indice === indiceRuta ? "page" : undefined}
                    onClick={(evento) => {
                      const nuevaPestana =
                        evento.button !== 0 ||
                        evento.metaKey ||
                        evento.ctrlKey ||
                        evento.shiftKey ||
                        evento.altKey;
                      if (!nuevaPestana)
                        setPulsado({ href: enlace.href, desde: ruta });
                    }}
                    className={`presion relative flex items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${
                      marcado
                        ? "bg-primary text-primary-foreground group-data-[resaltado=listo]:bg-transparent"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icono nombre={enlace.icono} className="size-4 shrink-0" />
                    {enlace.texto}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}