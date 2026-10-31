"use client";

import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { claseBotonPrimario, claseEnlace } from "@/app/components/formulario";
import { SelectorFiltro } from "@/app/components/selector-filtro";
import type { PaginaCasos } from "./datos";

export type FiltrosCasos = Record<
  "nombre" | "rut" | "responsable" | "anio" | "fecha" | "estado",
  string
>;
const entrada =
  "mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15";

function Aplicar() {
  const { pending } = useFormStatus();
  return (
    <button className={claseBotonPrimario} type="submit" disabled={pending}>
      {pending ? "Buscando…" : "Aplicar filtros"}
    </button>
  );
}

export function FiltrosListaCasos({
  inicial,
  opciones,
  estados,
}: {
  inicial: FiltrosCasos;
  opciones: PaginaCasos["opciones"];
  estados: [string, string][];
}) {
  const [valores, setValores] = useState(inicial);
  const seleccionar = (
    campo: "responsable" | "anio" | "estado",
    etiqueta: string,
    opciones: [string, string][],
  ) => (
    <SelectorFiltro
      nombre={campo}
      etiqueta={etiqueta}
      valor={valores[campo]}
      opciones={opciones}
      cambiar={(valor) => setValores((prev) => ({ ...prev, [campo]: valor }))}
    />
  );
  return (
    <Form
      action="/convivencia/casos"
      scroll={false}
      aria-label="Filtrar casos"
      className="mb-5 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <label className="block text-sm font-medium">
          Nombre o caso
          <input
            name="nombre"
            type="search"
            defaultValue={inicial.nombre}
            maxLength={120}
            placeholder="Estudiante, título o código"
            className={entrada}
          />
        </label>
        <label className="block text-sm font-medium">
          RUT del estudiante
          <input
            name="rut"
            type="search"
            defaultValue={inicial.rut}
            maxLength={20}
            placeholder="Con o sin puntos y guion"
            className={entrada}
          />
        </label>
        {seleccionar("responsable", "Responsable", [
          ["", "Todos los responsables"],
          ...opciones.responsables.map((r): [string, string] => [
            r.id,
            r.nombre,
          ]),
        ])}
        {seleccionar("anio", "Año de inicio", [
          ["", "Todos los años"],
          ...opciones.anios.map((anio): [string, string] => [anio, anio]),
        ])}
        <label className="block text-sm font-medium">
          Fecha de inicio
          <input
            name="fecha"
            type="date"
            defaultValue={inicial.fecha}
            className={entrada}
          />
        </label>
        {seleccionar("estado", "Estado", [
          ["", "Todos los estados"],
          ...estados,
        ])}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Combina los filtros para encontrar un caso
        </p>
        <div className="flex items-center gap-4">
          {Object.values(inicial).some(Boolean) && (
            <Link
              href="/convivencia/casos"
              scroll={false}
              className={claseEnlace}
            >
              Limpiar filtros
            </Link>
          )}
          <Aplicar />
        </div>
      </div>
    </Form>
  );
}
