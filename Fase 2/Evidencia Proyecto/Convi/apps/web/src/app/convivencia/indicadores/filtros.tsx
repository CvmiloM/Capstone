"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { EnlaceConCarga, FormularioBusqueda } from "@/app/components/actividad";
import { claseBotonPrimario } from "@/app/components/formulario";

export type OpcionesIndicadores = {
  cursos: { id: string; nombre: string }[];
  categorias: { id: string; nombre: string }[];
};

const control = "mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";

function Buscar() {
  const { pending } = useFormStatus();
  return <button type="submit" className={claseBotonPrimario} disabled={pending}>{pending ? "Buscando…" : "Buscar"}</button>;
}

export function FiltrosIndicadores({ inicial, opciones, error }: {
  inicial: { desde: string; hasta: string; curso: string; categoria: string };
  opciones: OpcionesIndicadores;
  error?: string;
}) {
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const limite = desde ? new Date(`${desde}T00:00:00Z`) : null;
  if (limite && Number.isFinite(limite.getTime())) limite.setUTCDate(limite.getUTCDate() + 366);
  const maximo = limite && Number.isFinite(limite.getTime()) ? limite.toISOString().slice(0, 10) : undefined;

  return <FormularioBusqueda action="/convivencia/indicadores" scroll={false}
    aria-label="Buscar indicadores" className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
    <input type="hidden" name="buscar" value="1" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="block text-sm font-medium">Desde
        <input name="desde" type="date" required value={desde} max={hasta || undefined}
          onInput={(evento) => setDesde(evento.currentTarget.value)} className={control} />
      </label>
      <label className="block text-sm font-medium">Hasta
        <input name="hasta" type="date" required value={hasta} min={desde || undefined} max={maximo}
          onInput={(evento) => setHasta(evento.currentTarget.value)} className={control} />
      </label>
      <label className="block text-sm font-medium">Curso
        <select name="curso" defaultValue={inicial.curso} className={control}>
          <option value="">Todos los cursos</option>
          {opciones.cursos.map((curso) => <option key={curso.id} value={curso.id}>{curso.nombre}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Categoría
        <select name="categoria" defaultValue={inicial.categoria} className={control}>
          <option value="">Todas las categorías</option>
          {opciones.categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
        </select>
      </label>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Buscar />
      <EnlaceConCarga href="/convivencia/indicadores" onClick={(evento) => {
        evento.currentTarget.closest("form")?.reset();
        setDesde("");
        setHasta("");
      }} className="text-sm text-primary underline-offset-4 hover:underline">Limpiar filtros</EnlaceConCarga>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Elige ambas fechas y pulsa Buscar, el período admite hasta 367 días y usa la zona horaria de la escuela</p>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </FormularioBusqueda>;
}
