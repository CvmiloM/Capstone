"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * "Cómo avanza": la fila de momentos de una situación, de izquierda a
 * derecha. Se arrastra con el mouse (sigue al puntero 1:1 desde donde se tomó),
 * se recorre con los botones o con el teclado, y la barra muestra cuánto se
 * ha avanzado.
 */
export function FilaDeMomentos({
  titulo,
  children,
}: {
  titulo: ReactNode;
  children: ReactNode;
}) {
  const fila = useRef<HTMLOListElement>(null);
  const [avance, setAvance] = useState(0);

  useEffect(() => {
    const elemento = fila.current;
    if (!elemento) return;
    const medir = () => {
      const recorrido = elemento.scrollWidth - elemento.clientWidth;
      setAvance(recorrido > 0 ? elemento.scrollLeft / recorrido : 1);
    };
    const primera = requestAnimationFrame(medir);
    elemento.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(primera);
      elemento.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, []);

  // Arrastre con el mouse; en pantallas táctiles el desplazamiento es el nativo.
  useEffect(() => {
    const elemento = fila.current;
    if (!elemento) return;
    let inicio: { x: number; scroll: number; id: number } | null = null;
    let movio = false;
    const bajar = (evento: PointerEvent) => {
      if (evento.pointerType !== "mouse" || evento.button !== 0) return;
      inicio = {
        x: evento.clientX,
        scroll: elemento.scrollLeft,
        id: evento.pointerId,
      };
      movio = false;
    };
    const mover = (evento: PointerEvent) => {
      if (!inicio) return;
      const desplazamiento = evento.clientX - inicio.x;
      if (!movio && Math.abs(desplazamiento) > 6) {
        movio = true;
        elemento.setPointerCapture(inicio.id);
        elemento.dataset.arrastrando = "si";
      }
      if (movio) elemento.scrollLeft = inicio.scroll - desplazamiento;
    };
    const soltar = () => {
      inicio = null;
      delete elemento.dataset.arrastrando;
    };
    elemento.addEventListener("pointerdown", bajar);
    elemento.addEventListener("pointermove", mover);
    elemento.addEventListener("pointerup", soltar);
    elemento.addEventListener("pointercancel", soltar);
    return () => {
      elemento.removeEventListener("pointerdown", bajar);
      elemento.removeEventListener("pointermove", mover);
      elemento.removeEventListener("pointerup", soltar);
      elemento.removeEventListener("pointercancel", soltar);
    };
  }, []);

  const mover = (sentido: number) => {
    const elemento = fila.current;
    if (!elemento) return;
    elemento.scrollBy({ left: sentido * (300 + 32), behavior: "smooth" });
  };

  return (
    <div>
      {titulo}
      <ol
        ref={fila}
        tabIndex={0}
        aria-label="Momentos de una situación"
        className="lp-fila mt-14 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-tinta"
      >
        {children}
      </ol>
      <div className="mx-[var(--margen)] mt-10 flex items-center gap-6">
        <div className="lp-progreso flex-1" aria-hidden="true">
          <span style={{ width: `${Math.max(8, avance * 100)}%` }} />
        </div>
        <div className="hidden gap-2 md:flex">
          <button
            type="button"
            aria-label="Momento anterior"
            disabled={avance <= 0.001}
            onClick={() => mover(-1)}
            className="lp-boton-cuadrado"
          >
            <Flecha giro={180} />
          </button>
          <button
            type="button"
            aria-label="Momento siguiente"
            disabled={avance >= 0.999}
            onClick={() => mover(1)}
            className="lp-boton-cuadrado"
          >
            <Flecha giro={0} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Flecha({ giro }: { giro: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ rotate: `${giro}deg` }}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}