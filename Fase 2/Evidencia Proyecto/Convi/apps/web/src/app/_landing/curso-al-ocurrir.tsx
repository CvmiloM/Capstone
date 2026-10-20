"use client";

import { useState } from "react";

/*
 * Lo que se puede tocar en la landing: mover la fecha del hecho y ver qué
 * curso guarda Convi en la situación (PB-076, HU-066). Usa la misma regla que
 * la API: la matrícula vigente ese día según la fecha del colegio; si ese día
 * no tenía, queda "Curso histórico no registrado". Datos de ejemplo.
 */
const MATRICULAS = [
  { curso: "1° medio A", anio: 2024, desde: "2024-03-04", hasta: "2024-12-13", estado: "Completada" },
  { curso: "2° medio A", anio: 2025, desde: "2025-03-03", hasta: "2025-06-30", estado: "Trasladada" },
  { curso: "2° medio C", anio: 2025, desde: "2025-07-01", hasta: "2025-12-19", estado: "Completada" },
  { curso: "3° medio C", anio: 2026, desde: "2026-03-02", hasta: null, estado: "Activa" },
] as const;

const DIA = 86_400_000;
const INICIO = Date.UTC(2024, 2, 1);
const FIN = Date.UTC(2026, 9, 15);
const DIAS = Math.round((FIN - INICIO) / DIA);

const PRUEBAS = [
  { texto: "Abril de 2024", fecha: "2024-04-16" },
  { texto: "Enero de 2025", fecha: "2025-01-20" },
  { texto: "Septiembre de 2025", fecha: "2025-09-08" },
];

const formato = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function aDia(fecha: string) {
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - INICIO) / DIA);
}

function vigente(dia: number) {
  return MATRICULAS.findIndex(
    (m) => aDia(m.desde) <= dia && (m.hasta === null || dia <= aDia(m.hasta)),
  );
}

export function CursoAlOcurrir() {
  const [dia, setDia] = useState(aDia("2025-05-20"));
  const fecha = formato.format(new Date(INICIO + dia * DIA));
  const indice = vigente(dia);
  const matricula = indice >= 0 ? MATRICULAS[indice] : null;
  const actual = MATRICULAS[MATRICULAS.length - 1];

  return (
    <div className="bg-crema p-6 text-tinta sm:p-10">
      <p className="text-[length:var(--t-chico)] font-semibold">
        Expediente de Martina Soto · Curso actual: {actual.curso} ({actual.anio})
      </p>

      <label htmlFor="fecha-del-hecho" className="mt-6 block font-semibold">
        Fecha del hecho: <span className="tabular-nums">{fecha}</span>
      </label>
      <input
        id="fecha-del-hecho"
        type="range"
        min={0}
        max={DIAS}
        step={1}
        value={dia}
        aria-valuetext={fecha}
        onChange={(evento) => setDia(Number(evento.target.value))}
        className="mt-4 block h-11 w-full cursor-pointer accent-tinta"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {PRUEBAS.map((prueba) => (
          <button
            key={prueba.fecha}
            type="button"
            onClick={() => setDia(aDia(prueba.fecha))}
            className="presion rounded-full bg-tinta/8 px-4 py-2 text-[length:var(--t-chico)] font-semibold hover:bg-tinta/15"
          >
            {prueba.texto}
          </button>
        ))}
      </div>

      <p className="mt-8 font-semibold">Curso al ocurrir el hecho</p>
      <p
        aria-live="polite"
        className="font-titulo text-[length:var(--t-frase)] leading-tight font-bold"
      >
        {matricula
          ? `${matricula.curso} (${matricula.anio})`
          : "Curso histórico no registrado"}
      </p>
      <p className="mt-2 max-w-[52ch] text-pretty">
        {matricula
          ? "La situación queda con esta matrícula aunque Martina cambie de curso después."
          : "Ese día no tenía matrícula vigente: la situación se registra igual, sin curso."}
      </p>

      <table className="mt-8 w-full text-left text-[length:var(--t-chico)] tabular-nums">
        <caption className="sr-only">Matrículas de Martina Soto</caption>
        <thead>
          <tr className="border-b-2 border-tinta/20">
            <th className="py-2 pr-3 font-semibold">Curso</th>
            <th className="py-2 pr-3 font-semibold">Desde</th>
            <th className="py-2 pr-3 font-semibold">Hasta</th>
            <th className="py-2 font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody>
          {MATRICULAS.map((m, i) => (
            <tr
              key={m.desde}
              className={`transition-colors duration-200 ${
                i === indice ? "bg-amarillo/40 font-semibold" : ""
              }`}
            >
              <td className="py-2 pr-3">{m.curso}</td>
              <td className="py-2 pr-3">{m.desde.split("-").reverse().join("-")}</td>
              <td className="py-2 pr-3">
                {m.hasta ? m.hasta.split("-").reverse().join("-") : "Hoy"}
              </td>
              <td className="py-2">{m.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}