"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";

/**
 * Pestañas de la ficha del caso, con el mismo movimiento del menú lateral:
 * - El resaltado azul es un solo elemento que se desliza con el resorte
 *   (--resorte, en globals.css) hasta la pestaña elegida apenas se hace clic,
 *   sin esperar a que lleguen los datos.
 * - Mientras la API responde, el contenido de la pestaña se reemplaza por un
 *   esqueleto, y el encabezado del caso queda quieto.
 * - Al llegar, el contenido entra desde el lado de la pestaña elegida.
 */
export function PestanasCaso({
  ruta,
  secciones,
  seccion,
  children,
}: {
  ruta: string;
  secciones: [clave: string, texto: string][];
  /** La pestaña que muestra la página. */
  seccion: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const [pulsada, setPulsada] = useState<string | null>(null);
  // Mientras carga manda el clic, después la página.
  const marcada = cargando && pulsada ? pulsada : seccion;
  const indiceMarcado = secciones.findIndex(([clave]) => clave === marcada);

  // De qué lado entra el contenido nuevo: el de la pestaña elegida respecto
  // de la anterior, también al volver con el botón Atrás del navegador.
  const [vista, setVista] = useState<{
    seccion: string;
    desde: string | null;
  }>({ seccion, desde: null });
  if (vista.seccion !== seccion) {
    const antes = secciones.findIndex(([clave]) => clave === vista.seccion);
    const ahora = secciones.findIndex(([clave]) => clave === seccion);
    setVista({ seccion, desde: ahora > antes ? "24px 0" : "-24px 0" });
  }

  const barra = useRef<HTMLElement>(null);
  const marca = useRef<HTMLSpanElement>(null);

  // Ubica el resaltado sobre la pestaña marcada. La primera vez aparece en
  // su lugar sin animación, después se desliza.
  useLayoutEffect(() => {
    const nav = barra.current;
    const span = marca.current;
    if (!nav || !span) return;
    const ubicar = () => {
      const enlace = nav.querySelector<HTMLElement>(
        `[data-indice="${indiceMarcado}"]`,
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
  }, [indiceMarcado]);

  return (
    <>
      <nav
        ref={barra}
        aria-label="Secciones del caso"
        className="group relative mb-6 flex gap-1 overflow-x-auto border-b border-border pb-3"
      >
        {/* Un solo resaltado que se desliza, detrás del texto de las pestañas. */}
        <span
          ref={marca}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 rounded-xl bg-primary opacity-0 group-data-[resaltado=listo]:transition-[translate,width,height,opacity] group-data-[resaltado=listo]:duration-[420ms] group-data-[resaltado=listo]:ease-resorte"
        />
        {secciones.map(([clave, texto], indice) => {
          const href = `${ruta}?seccion=${clave}`;
          const marcadaAqui = clave === marcada;
          return (
            <Link
              key={clave}
              href={href}
              scroll={false}
              data-indice={indice}
              aria-current={seccion === clave ? "page" : undefined}
              onClick={(evento) => {
                // Con Ctrl, Shift o la rueda se abre en otra pestaña, como siempre.
                if (
                  evento.button !== 0 ||
                  evento.metaKey ||
                  evento.ctrlKey ||
                  evento.shiftKey ||
                  evento.altKey
                )
                  return;
                evento.preventDefault();
                if (clave === marcada) return;
                setPulsada(clave);
                iniciar(() => router.push(href, { scroll: false }));
              }}
              className={`presion relative min-h-11 shrink-0 rounded-xl px-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${
                marcadaAqui
                  ? "bg-primary font-semibold text-primary-foreground group-data-[resaltado=listo]:bg-transparent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {texto}
            </Link>
          );
        })}
      </nav>
      {cargando ? (
        <EsqueletoPestana />
      ) : (
        <div
          key={vista.seccion}
          style={
            vista.desde
              ? ({ "--entra-desde": vista.desde } as CSSProperties)
              : undefined
          }
          className={
            vista.desde
              ? "animate-[pagina-aparece_220ms_ease-out_both,pagina-entra_var(--duracion-resorte)_var(--resorte)_both]"
              : undefined
          }
        >
          {children}
        </div>
      )}
    </>
  );
}

/** La forma de una sección del caso mientras llegan sus datos. */
function EsqueletoPestana() {
  return (
    <div
      role="status"
      aria-label="Cargando la sección"
      className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
    >
      <div className="mb-5 h-5 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="space-y-4">
        {[92, 76, 84, 64].map((ancho) => (
          <div key={ancho} className="flex items-center gap-4">
            <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div
                className="h-4 animate-pulse rounded bg-muted"
                style={{ width: `${ancho}%` }}
              />
              <div
                className="h-3 animate-pulse rounded bg-muted"
                style={{ width: `${ancho - 30}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
