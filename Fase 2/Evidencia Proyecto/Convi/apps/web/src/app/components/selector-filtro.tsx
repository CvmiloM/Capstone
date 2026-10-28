"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";

export function SelectorFiltro({
  nombre,
  etiqueta,
  valor,
  opciones,
  cambiar,
}: {
  nombre: string;
  etiqueta: string;
  valor: string;
  opciones: [string, string][];
  cambiar: (valor: string) => void;
}) {
  const id = useId();
  const detalle = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      if (detalle.current && !detalle.current.contains(e.target as Node))
        detalle.current.open = false;
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, []);
  function teclado(e: KeyboardEvent<HTMLDetailsElement>) {
    const menu = detalle.current;
    if (!menu) return;
    if (e.key === "Escape") {
      e.preventDefault();
      menu.open = false;
      menu.querySelector("summary")?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    menu.open = true;
    const botones = Array.from(
      menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    );
    const actual = botones.indexOf(document.activeElement as HTMLButtonElement);
    const siguiente =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? botones.length - 1
          : e.key === "ArrowDown"
            ? (actual + 1) % botones.length
            : actual < 0
              ? botones.length - 1
              : (actual - 1 + botones.length) % botones.length;
    botones[siguiente]?.focus();
  }
  return (
    <div>
      <span id={id} className="mb-1.5 block text-sm font-medium">
        {etiqueta}
      </span>
      <input type="hidden" name={nombre} value={valor} />
      <details
        ref={detalle}
        className="relative"
        onKeyDown={teclado}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            e.currentTarget.open = false;
        }}
      >
        <summary
          aria-labelledby={`${id} ${id}-valor`}
          aria-haspopup="menu"
          className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-input bg-card px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
        >
          <span id={`${id}-valor`}>
            {opciones.find((o) => o[0] === valor)?.[1] ?? opciones[0][1]}
          </span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div
          role="menu"
          aria-labelledby={id}
          className="absolute left-0 top-full z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-border bg-card p-1.5 shadow-tarjeta"
        >
          {opciones.map(([codigo, texto]) => (
            <button
              key={codigo}
              type="button"
              role="menuitemradio"
              aria-checked={valor === codigo}
              tabIndex={-1}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none ${valor === codigo ? "bg-accent font-medium" : ""}`}
              onClick={() => {
                cambiar(codigo);
                if (detalle.current) {
                  detalle.current.open = false;
                  detalle.current.querySelector("summary")?.focus();
                }
              }}
            >
              {texto}
              <span aria-hidden="true">{valor === codigo ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
