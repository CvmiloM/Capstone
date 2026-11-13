"use client";

import { useId, useState } from "react";

export function Distribucion({ titulo, datos, total, sinBorde=false, porDia=false }: {
  titulo:string; datos:{nombre:string;total:number}[]; total:number; sinBorde?:boolean; porDia?:boolean;
}) {
  const id=useId();
  const [desde,setDesde]=useState("");
  const [hasta,setHasta]=useState("");
  const invalido=Boolean(desde&&hasta&&desde>hasta);
  const visibles=invalido?[]:datos.filter(f=>!porDia||(!desde||f.nombre>=desde)&&(!hasta||f.nombre<=hasta));
  const fila=(f:{nombre:string;total:number})=><li key={f.nombre}>
    <div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{porDia?f.nombre.split("-").reverse().join("-"):f.nombre}</span><span className="shrink-0 text-muted-foreground">{f.total} de {total}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${total?f.total*100/total:0}%`}}/></div>
  </li>;
  return <section className={sinBorde?"":"rounded-2xl border border-border bg-card p-5 shadow-tarjeta"}>
    <h2 className="font-titulo text-xl font-semibold">{titulo}</h2>
    {porDia&&<div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label htmlFor={`${id}-desde`} className="text-sm">Mostrar desde<input id={`${id}-desde`} type="date" value={desde} min={datos[0]?.nombre} max={datos.at(-1)?.nombre} onChange={e=>setDesde(e.target.value)} className="mt-1 block w-full rounded-lg border border-input bg-card p-2 focus-visible:outline-ring"/></label>
      <label htmlFor={`${id}-hasta`} className="text-sm">Mostrar hasta<input id={`${id}-hasta`} type="date" value={hasta} min={datos[0]?.nombre} max={datos.at(-1)?.nombre} onChange={e=>setHasta(e.target.value)} className="mt-1 block w-full rounded-lg border border-input bg-card p-2 focus-visible:outline-ring"/></label>
    </div>}
    {invalido&&<p role="alert" className="mt-3 text-sm text-destructive">Hasta debe ser igual o posterior a Desde.</p>}
    <p className="mt-2 text-xs text-muted-foreground">Cada barra indica su parte de las {total} situaciones del período consultado.</p>
    {!visibles.length?<p role="status" className="mt-3 text-sm text-muted-foreground">Sin datos para esta selección.</p>:<>
      <ul className="mt-4 space-y-3">{visibles.slice(0,5).map(fila)}</ul>
      {visibles.length>5&&<details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer py-2 text-sm font-medium text-primary">{visibles.length===6?"Ver el registro restante":`Ver los ${visibles.length-5} registros restantes`}</summary><ul tabIndex={0} aria-label={`Resto de ${titulo.toLowerCase()}`} className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-3 focus-visible:outline-2 focus-visible:outline-ring">{visibles.slice(5).map(fila)}</ul></details>}
    </>}
  </section>;
}
