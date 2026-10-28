"use client";

import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { claseBotonPrimario, claseEnlace } from "@/app/components/formulario";
import { SelectorFiltro } from "@/app/components/selector-filtro";
import type { PaginaHistorial } from "@/app/components/auditoria/lista-historial";

export type Filtros = Record<
  | "colaborador"
  | "fecha"
  | "desde"
  | "hasta"
  | "palabras"
  | "recurso"
  | "accion"
  | "resultado",
  string
>;
const entrada =
  "w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15";

function Aplicar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={claseBotonPrimario}>
      {pending ? "Aplicando…" : "Aplicar filtros"}
    </button>
  );
}

export function FiltrosAuditoria({
  inicial,
  opciones,
}: {
  inicial: Filtros;
  opciones: PaginaHistorial["opciones"];
}) {
  const [valores, setValores] = useState(inicial);
  const ampliados = Boolean(
    inicial.desde ||
    inicial.hasta ||
    inicial.palabras ||
    inicial.recurso ||
    inicial.accion ||
    inicial.resultado,
  );
  const activos = Object.values(valores).some(Boolean);
  function cambiar(campo: keyof Filtros, valor: string) {
    setValores((prev) => ({
      ...prev,
      [campo]: valor,
      ...(campo === "fecha" && valor
        ? { desde: "", hasta: "" }
        : (campo === "desde" || campo === "hasta") && valor
          ? { fecha: "" }
          : {}),
    }));
  }
  const lista = (
    datos: Record<string, string>,
    todos: string,
  ): [string, string][] => [
    ["", todos],
    ...Object.entries(datos).sort((a, b) => a[1].localeCompare(b[1], "es")),
  ];
  return (
    <Form
      action="/admin/auditoria"
      scroll={false}
      className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
      aria-label="Filtros de auditoría"
      onInvalidCapture={(e) => {
        const cerrado = (e.target as HTMLElement).closest("details");
        if (cerrado) cerrado.open = true;
      }}
    >
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,200px)_auto]">
        <label className="block text-sm font-medium">
          Colaborador
          <input
            name="colaborador"
            type="search"
            value={valores.colaborador}
            onChange={(e) => cambiar("colaborador", e.target.value)}
            maxLength={100}
            placeholder="Buscar por nombre o apellido"
            className={`mt-1.5 ${entrada}`}
          />
        </label>
        <label className="block text-sm font-medium">
          Fecha específica
          <input
            name="fecha"
            type="date"
            value={valores.fecha}
            onChange={(e) => cambiar("fecha", e.target.value)}
            className={`mt-1.5 ${entrada}`}
          />
        </label>
        <Aplicar />
      </div>
      <details open={ampliados} className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          Más filtros{" "}
          <span
            aria-hidden="true"
            className="transition-transform group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Desde
            <input
              name="desde"
              type="date"
              value={valores.desde}
              max={valores.hasta || undefined}
              onChange={(e) => cambiar("desde", e.target.value)}
              className={`mt-1.5 ${entrada}`}
            />
          </label>
          <label className="block text-sm font-medium">
            Hasta
            <input
              name="hasta"
              type="date"
              value={valores.hasta}
              min={valores.desde || undefined}
              onChange={(e) => cambiar("hasta", e.target.value)}
              className={`mt-1.5 ${entrada}`}
            />
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            Palabras clave
            <input
              name="palabras"
              type="search"
              value={valores.palabras}
              onChange={(e) => cambiar("palabras", e.target.value)}
              maxLength={160}
              placeholder="Ejemplo: documento actualizado"
              className={`mt-1.5 ${entrada}`}
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Busca en los datos visibles del registro
            </span>
          </label>
          <SelectorFiltro
            nombre="recurso"
            etiqueta="Tipo de registro"
            valor={valores.recurso}
            cambiar={(v) => cambiar("recurso", v)}
            opciones={lista(opciones.recursos, "Todos los tipos")}
          />
          <SelectorFiltro
            nombre="accion"
            etiqueta="Acción"
            valor={valores.accion}
            cambiar={(v) => cambiar("accion", v)}
            opciones={lista(opciones.acciones, "Todas las acciones")}
          />
          <SelectorFiltro
            nombre="resultado"
            etiqueta="Resultado"
            valor={valores.resultado}
            cambiar={(v) => cambiar("resultado", v)}
            opciones={lista(
              Object.fromEntries(
                Object.entries(opciones.resultados).filter(
                  ([v]) => !["EXITO", "FALLIDO"].includes(v),
                ),
              ),
              "Todos los resultados",
            )}
          />
        </div>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          Completa uno o más campos y pulsa Aplicar filtros, puedes elegir un
          día o un rango de fechas
        </p>
        {activos && (
          <Link
            href="/admin/auditoria"
            onClick={() =>
              setValores({
                colaborador: "",
                fecha: "",
                desde: "",
                hasta: "",
                palabras: "",
                recurso: "",
                accion: "",
                resultado: "",
              })
            }
            scroll={false}
            className={`text-sm ${claseEnlace}`}
          >
            Limpiar filtros
          </Link>
        )}
      </div>
    </Form>
  );
}
