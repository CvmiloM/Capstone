"use client";

import { useState } from "react";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { claseEnlace } from "@/app/components/formulario";

export type PrioridadJornada = {
  id: string;
  tipo: string;
  codigo: string | null;
  titulo: string;
  etiqueta: string;
  href: string;
  fecha: string;
};
export type PlanJornada = {
  id: string;
  nombre: string;
  anio: number;
  total: number;
  completadas: number;
  canceladas: number;
};

export function Prioridades({ filas }: { filas: PrioridadJornada[] }) {
  const [tipo, setTipo] = useState("");
  const visibles = filas.filter((f) => !tipo || f.tipo === tipo).slice(0, 4);
  return (
    <>
      <div aria-label="Tipo de prioridad" className="my-4 flex flex-wrap gap-2">
        {[
          ["", "Todas"],
          ["SITUACION", "Situaciones"],
          ["CASO", "Casos"],
          ["SEGUIMIENTO", "Seguimientos"],
        ].map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            aria-pressed={tipo === valor}
            onClick={() => setTipo(valor)}
            className={`min-h-10 rounded-full border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring ${tipo === valor ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      {visibles.length ? (
        <ul className="divide-y divide-border">
          {visibles.map((f) => (
            <li key={`${f.tipo}-${f.id}`}>
              <Link
                href={f.href}
                anticipar
                className="group flex min-h-20 flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-4 hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {f.tipo === "SITUACION"
                      ? "Situación"
                      : f.tipo === "CASO"
                        ? "Caso"
                        : "Seguimiento"}
                    {f.codigo && ` · ${f.codigo}`}
                  </p>
                  <p className="mt-1 break-words font-medium">{f.titulo}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${f.etiqueta === "Urgente" ? "bg-amber-50 text-amber-900" : "bg-accent text-accent-foreground"}`}
                >
                  {f.etiqueta}
                </span>
                <span className="text-sm font-medium text-primary group-hover:underline">
                  Abrir<span className="sr-only"> {f.titulo}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-sm text-muted-foreground">
          No hay registros de este tipo entre las prioridades mostradas.
        </p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Hasta cuatro registros por vista de este resumen, las bandejas permiten
        revisar los demás.
      </p>
      <Link
        href={
          tipo === "CASO"
            ? "/convivencia/casos"
            : tipo === "SEGUIMIENTO"
              ? "/convivencia/jornada/seguimientos"
              : "/convivencia/situaciones"
        }
        className={`mt-3 inline-block text-sm ${claseEnlace}`}
      >
        {tipo === "CASO"
          ? "Ver todos los casos"
          : tipo === "SEGUIMIENTO"
            ? "Ver seguimientos pendientes"
            : "Ver situaciones"}
      </Link>
    </>
  );
}

export function AvancePreventivo({ planes }: { planes: PlanJornada[] }) {
  const [seleccion, setSeleccion] = useState(planes[0]?.id ?? "");
  const plan = planes.find((p) => p.id === seleccion);
  if (!plan)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        No hay un Plan activo para el año actual.{" "}
        <Link href="/convivencia/plan-gestion" className={claseEnlace}>
          Consultar planes
        </Link>
      </p>
    );
  const porcentaje = plan.total
    ? Math.round((plan.completadas / plan.total) * 100)
    : null;
  return (
    <div className="mt-4 space-y-5">
      {planes.length > 1 && (
        <>
          <label htmlFor="plan-jornada" className="block text-sm font-medium">
            Plan de Gestión
          </label>
          <select
            id="plan-jornada"
            value={seleccion}
            onChange={(e) => setSeleccion(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-input bg-card px-3"
          >
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </>
      )}
      <div className="flex flex-wrap items-center gap-6">
        <div
          className="relative size-32 shrink-0"
          role="img"
          aria-label={
            porcentaje === null
              ? "Sin actividades"
              : `${porcentaje} por ciento de actividades completadas`
          }
        >
          <svg
            viewBox="0 0 120 120"
            className="size-full -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-muted"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray={`${porcentaje ?? 0} 100`}
              className="text-primary"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums">
            {porcentaje === null ? "—" : `${porcentaje}%`}
          </span>
        </div>
        <div className="min-w-40 flex-1">
          <Link
            href={`/convivencia/plan-gestion/planes/${plan.id}`}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            {plan.nombre}
          </Link>
          <p className="mt-2 text-sm">
            {plan.completadas} de {plan.total} actividades completadas
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Avance de ejecución, no mide la eficacia del Plan. Todas las
            actividades pesan lo mismo
            {plan.canceladas
              ? `, el total incluye ${plan.canceladas} canceladas`
              : ""}
            .
          </p>
        </div>
      </div>
    </div>
  );
}
