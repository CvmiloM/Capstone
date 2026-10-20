"use client";

import { useState, type ReactNode } from "react";

export type GrupoIncluye = {
  nombre: string;
  filas: { nombre: string; valor: string; detalle: string }[];
};

/**
 * "Qué incluye" como la carta de una cafetería escolar: grupos, filas con
 * puntos guía y su valor a la derecha. Al apuntar o recorrer con el teclado
 * una fila, al lado entra la pantalla real de Convi de su grupo; esa vista
 * acompaña la lectura mientras se baja (la firma de movimiento de la página).
 * En pantallas angostas cada vista queda bajo su grupo.
 */
export function LoQueIncluye({
  titulo,
  grupos,
  vistas,
}: {
  titulo: ReactNode;
  grupos: GrupoIncluye[];
  vistas: ReactNode[];
}) {
  const [activo, setActivo] = useState(0);

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="lp-hoja lg:col-span-6 lg:col-start-1">
        {titulo}
        <div className="lp-menu mt-10 space-y-11">
          {grupos.map((grupo, g) => (
            <div key={grupo.nombre}>
              <h3 className="text-xl font-bold">{grupo.nombre}</h3>
              <ul className="mt-4 space-y-[18px]">
                {grupo.filas.map((fila) => (
                  <li
                    key={fila.nombre}
                    tabIndex={0}
                    onPointerEnter={() => setActivo(g)}
                    onFocus={() => setActivo(g)}
                    className="lp-fila-menu rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-tinta"
                  >
                    <p className="flex items-end">
                      <span className="font-semibold">{fila.nombre}</span>
                      <span aria-hidden="true" className="lp-guia" />
                      <span className="text-right font-semibold">
                        {fila.valor}
                      </span>
                    </p>
                    <p className="mt-1 max-w-[38ch] text-[length:var(--t-chico)] text-pretty">
                      {fila.detalle}
                    </p>
                  </li>
                ))}
              </ul>
              {/* En pantallas angostas la vista va bajo su grupo. */}
              <div className="mt-6 lg:hidden">{vistas[g]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden lg:sticky lg:top-[14svh] lg:col-span-5 lg:col-start-8 lg:block lg:self-start">
        <div key={activo} className="lp-vista">
          {vistas[activo]}
        </div>
      </div>
    </div>
  );
}