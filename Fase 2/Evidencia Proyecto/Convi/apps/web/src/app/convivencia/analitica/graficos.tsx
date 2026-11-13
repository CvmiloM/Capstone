"use client";

import { useId, useRef, useState } from "react";

// Analítica de Convivencia: gráfico de líneas con una o dos series. Al pasar
// el mouse una línea vertical marca el mes y un recuadro muestra sus valores,
// con el teclado se recorre con las flechas y se anuncian los valores del mes.

export type Serie = {
  nombre: string;
  /** null en los meses que todavía no llegan. */
  valores: (number | null)[];
  color: string;
  punteada?: boolean;
};

const ANCHO = 760;
const ALTO = 280;
const IZQ = 48;
const DER = 24;
const ARRIBA = 16;
const ABAJO = 40;

/** Eje con 4 tramos de números redondos que cubren el máximo. */
function ejeY(maximo: number) {
  const bruto = Math.max(1, maximo) / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((m) => m >= bruto) ?? bruto;
  return { tope: Math.ceil(paso) * 4, paso: Math.ceil(paso) };
}

export function GraficoLineas({
  titulo,
  etiquetas,
  series,
  marcaCada = 1,
}: {
  titulo: string;
  /** Una etiqueta corta por punto, por ejemplo «ene 25». */
  etiquetas: string[];
  series: Serie[];
  /** Cada cuántos puntos se escribe la etiqueta en el eje. */
  marcaCada?: number;
}) {
  const id = useId();
  const [activo, setActivo] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const n = etiquetas.length;
  const maximo = Math.max(0, ...series.flatMap((s) => s.valores.filter((v): v is number => v !== null)));
  const { tope, paso } = ejeY(maximo);
  const x = (i: number) => IZQ + (n === 1 ? (ANCHO - IZQ - DER) / 2 : (i * (ANCHO - IZQ - DER)) / (n - 1));
  const y = (v: number) => ARRIBA + (ALTO - ARRIBA - ABAJO) * (1 - v / tope);

  const trazo = (valores: (number | null)[]) => {
    let d = "";
    let abierto = false;
    valores.forEach((v, i) => {
      if (v === null) {
        abierto = false;
        return;
      }
      d += `${abierto ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      abierto = true;
    });
    return d;
  };

  const mover = (evento: React.PointerEvent<SVGSVGElement>) => {
    const caja = svg.current?.getBoundingClientRect();
    if (!caja || n === 0) return;
    const enSvg = ((evento.clientX - caja.left) / caja.width) * ANCHO;
    const i = Math.round(((enSvg - IZQ) / (ANCHO - IZQ - DER)) * (n - 1));
    setActivo(Math.min(n - 1, Math.max(0, i)));
  };

  const teclas = (evento: React.KeyboardEvent<SVGSVGElement>) => {
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    evento.preventDefault();
    setActivo((actual) => {
      const base = actual ?? (evento.key === "ArrowRight" ? -1 : n);
      return Math.min(n - 1, Math.max(0, base + (evento.key === "ArrowRight" ? 1 : -1)));
    });
  };

  const xActivo = activo === null ? 0 : x(activo);
  const recuadroIzq = xActivo > ANCHO * 0.6;

  return (
    <figure className="mt-4">
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Leyenda">
          {series.map((s) => (
            <li key={s.nombre} className="flex items-center gap-2">
              <svg width="28" height="10" aria-hidden="true">
                <line x1="0" y1="5" x2="28" y2="5" stroke={s.color} strokeWidth="2.5"
                  strokeDasharray={s.punteada ? "5 4" : undefined} />
              </svg>
              {s.nombre}
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          role="img"
          aria-labelledby={`${id}-t`}
          tabIndex={0}
          onPointerMove={mover}
          onPointerLeave={() => setActivo(null)}
          onKeyDown={teclas}
          onBlur={() => setActivo(null)}
          className="w-full touch-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <title id={`${id}-t`}>{`${titulo}, usa las flechas para recorrer los meses y consultar sus valores`}</title>
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line x1={IZQ} x2={ANCHO - DER} y1={y(paso * i)} y2={y(paso * i)}
                stroke="var(--border)" strokeWidth="1" />
              <text x={IZQ - 8} y={y(paso * i) + 4} textAnchor="end" fontSize="12" fill="var(--muted-foreground)">
                {(paso * i).toLocaleString("es-CL")}
              </text>
            </g>
          ))}
          {etiquetas.map((e, i) =>
            i % marcaCada === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={ALTO - ABAJO + 22} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">
                {e}
              </text>
            ) : null,
          )}
          {activo !== null && (
            <line x1={xActivo} x2={xActivo} y1={ARRIBA} y2={ALTO - ABAJO} stroke="var(--muted-foreground)" strokeWidth="1" />
          )}
          {series.map((s) => (
            <path key={s.nombre} d={trazo(s.valores)} fill="none" stroke={s.color} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.punteada ? "6 5" : undefined} />
          ))}
          {activo !== null &&
            series.map((s) => {
              const v = s.valores[activo];
              return v === null || v === undefined ? null : (
                <circle key={s.nombre} cx={xActivo} cy={y(v)} r="5" fill={s.color} stroke="var(--card)" strokeWidth="2" />
              );
            })}
        </svg>
        {activo !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-tarjeta"
            style={recuadroIzq ? { right: `${100 - (xActivo / ANCHO) * 100 + 1.5}%` } : { left: `${(xActivo / ANCHO) * 100 + 1.5}%` }}
          >
            <p className="font-semibold">{etiquetas[activo]}</p>
            {series.map((s) => (
              <p key={s.nombre} className="mt-0.5 flex items-center gap-2 tabular-nums">
                <span aria-hidden="true" className="inline-block h-0.5 w-3" style={{ background: s.color }} />
                {series.length > 1 && <span className="text-muted-foreground">{s.nombre}</span>}
                <span className="font-medium">
                  {s.valores[activo] === null ? "Aún no llega" : `${s.valores[activo]} ${s.valores[activo] === 1 ? "situación" : "situaciones"}`}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
