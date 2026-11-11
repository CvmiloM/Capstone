import { AVISO_HALLAZGOS, hallazgosConPosicion, type Informe, type SeccionInforme } from "./datos";

function valor(v: string|number|null,columna="") { return v===null?(columna.includes("Variación")?"No calculable":"Sin datos"):typeof v==="number"?v.toLocaleString("es-CL",{maximumFractionDigits:1})+(columna.includes("Variación")?" %":""):v; }

function TablaInforme({ seccion:s }: { seccion:SeccionInforme }) {
  return <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
    <caption className="sr-only">{s.titulo}</caption>
    <thead className="border-b border-border text-muted-foreground"><tr>{s.columnas.map(c=><th scope="col" key={c} className="px-3 py-3 font-medium first:pl-0">{c}</th>)}</tr></thead>
    <tbody>{s.filas.map((fila,n)=><tr key={n} className="border-b border-border last:border-0">{fila.map((v,i)=>i===0?<th key={i} scope="row" className="min-w-36 py-3 pr-3 align-top font-medium">{valor(v,s.columnas[i])}</th>:<td key={i} className="min-w-24 max-w-xl whitespace-pre-wrap break-words px-3 py-3 align-top tabular-nums">{valor(v,s.columnas[i])}</td>)}</tr>)}</tbody>
  </table></div>;
}

function GraficoInforme({ seccion:s,verde }: { seccion:SeccionInforme; verde:boolean }) {
  const maximo=Math.max(1,...s.filas.flatMap(f=>f.slice(1).filter(v=>typeof v==="number") as number[]));
  if(s.grafico==="barras"&&s.id==="evolucion_mes"&&s.columnas[0]==="Mes"){
    const eje=Math.max(1,Math.ceil(maximo/4))*4;
    const paso=600/s.filas.length;
    const cruzado=new Set(s.filas.map(f=>String(f[0]).slice(0,4))).size>1;
    return <div className="mt-5 overflow-x-auto"><svg viewBox="0 0 720 320" role="img" aria-label="Evolución mensual de situaciones, meses en el eje horizontal y situaciones en el eje vertical, valores exactos en la tabla de datos" className={"w-full min-w-[36rem] "+(verde?"text-verde":"text-primary")}>
      <title>Evolución mensual de situaciones</title>
      {[0,1,2,3,4].map(i=><g key={i}><line x1="80" y1={245-i*50} x2="680" y2={245-i*50} stroke="currentColor" opacity=".15"/><text x="68" y={249-i*50} textAnchor="end" fontSize="13" fill="var(--foreground)">{eje*i/4}</text></g>)}
      <line x1="80" y1="45" x2="80" y2="245" stroke="var(--muted-foreground)"/><line x1="80" y1="245" x2="680" y2="245" stroke="var(--muted-foreground)"/>
      <text x="22" y="145" transform="rotate(-90 22 145)" textAnchor="middle" fontSize="14" fill="var(--foreground)">Situaciones</text>
      {s.filas.map((f,i)=>{
        const centro=80+(i+.5)*paso,alto=Number(f[1])/eje*200,ancho=Math.min(36,paso*.65);
        const mes=new Intl.DateTimeFormat("es-CL",{month:"short",timeZone:"UTC"}).format(new Date(String(f[0])+"-01T12:00:00Z")).slice(0,3);
        return <g key={String(f[0])}><rect x={centro-ancho/2} y={245-alto} width={ancho} height={alto} rx="2" fill="currentColor"><title>{f[0]+", "+f[1]+" situaciones"}</title></rect><text x={centro} y={235-alto} textAnchor="middle" fontSize="12" fill="var(--foreground)">{f[1]}</text><text x={centro} y="270" textAnchor="middle" fontSize="12" fill="var(--foreground)">{mes+(cruzado?" "+String(f[0]).slice(2,4):"")}</text></g>;
      })}
      <text x="380" y="303" textAnchor="middle" fontSize="14" fill="var(--foreground)">Meses</text>
    </svg></div>;
  }
  if(s.grafico==="barras")return <ul className="mt-5 space-y-3" aria-label={s.titulo}>{s.filas.map((f,i)=><li key={i} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)_3rem]">
    <span className="break-words text-sm">{f[0]}</span><div className="h-3 overflow-hidden rounded bg-muted" aria-hidden="true"><div className={"h-full rounded "+(verde?"bg-verde":"bg-primary")} style={{width:(Number(f[1])/maximo*100)+"%"}}/></div><span className="text-right text-sm font-semibold tabular-nums">{valor(f[1])}</span>
  </li>)}</ul>;
  if(s.grafico==="lineas") {
    const eje=Math.max(1,Math.ceil(maximo/4))*4;
    const puntos=s.filas.map((f,i)=>[55+i*550/Math.max(1,s.filas.length-1),190-Number(f[1])/eje*150]);
    return <div className="mt-5 overflow-x-auto"><svg viewBox="0 0 640 240" role="img" aria-label={s.titulo+", valores exactos en la tabla de datos"} className={"min-w-[30rem] w-full "+(verde?"text-verde":"text-primary")}>
      <title>{s.titulo}</title>
      {[0,1,2,3,4].map(i=><g key={i}><line x1="55" y1={190-i*37.5} x2="605" y2={190-i*37.5} stroke="currentColor" opacity=".15"/><text x="45" y={194-i*37.5} textAnchor="end" fontSize="16" fill="currentColor">{eje*i/4}</text></g>)}
      <polyline points={puntos.map(p=>p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
      {s.filas.map((f,i)=><g key={i}><circle cx={puntos[i][0]} cy={puntos[i][1]} r={s.filas.length>30?1.5:3} fill="currentColor"><title>{f[0]+", "+f[1]+" situaciones"}</title></circle>{(i%Math.ceil(s.filas.length/4)===0||i===s.filas.length-1)&&<text x={puntos[i][0]} y="220" textAnchor={i===0?"start":i===s.filas.length-1?"end":"middle"} fontSize="16" fill="currentColor">{String(f[0])}</text>}</g>)}
    </svg></div>;
  }
  if(s.grafico==="matriz")return <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{s.titulo}</caption><thead><tr>{s.columnas.map(c=><th key={c} scope="col" className="px-2 py-3 font-medium">{c}</th>)}</tr></thead><tbody>{s.filas.map((f,i)=><tr key={i}>{f.map((v,n)=>n===0?<th key={n} scope="row" className="min-w-44 px-2 py-3 font-medium">{v}</th>:<td key={n} className="min-w-20 border-2 border-card px-2 py-3 text-center tabular-nums" style={{backgroundColor:"color-mix(in srgb, "+(verde?"var(--verde)":"var(--primary)")+" "+Math.round(8+Number(v)/maximo*30)+"%, var(--card))"}}>{v}</td>)}</tr>)}</tbody></table></div>;
  return null;
}

export function VistaInforme({ informe }: { informe:Informe }) {
  const d=informe.definiciones_calculo;
  const p=d.presentacion;
  // Solo los hallazgos que se dejaron en el informe (anexo de insights).
  const lectura=hallazgosConPosicion(d.hallazgos).filter(h=>!(p.hallazgos_omitidos??[]).includes(h.posicion));
  const fecha=new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeStyle:"short",timeZone:d.indicadores.zona_horaria});
  return <article className="min-w-0 rounded-2xl border border-border bg-card px-5 py-7 sm:px-8 sm:py-9" aria-label="Vista previa del contenido del informe">
    <div className="border-b border-border pb-6"><p className="text-sm text-muted-foreground">{d.escuela}</p><h2 className={"mt-3 break-words font-serif text-3xl font-semibold "+(p.tema==="verde"?"text-verde":"text-primary")}>{p.titulo}</h2>{p.subtitulo&&<p className="mt-3 whitespace-pre-wrap text-lg">{p.subtitulo}</p>}<p className="mt-4 text-sm">Del {d.alcance.desde} al {d.alcance.hasta}</p><p className="mt-2 text-xs text-muted-foreground">Creado por {d.creador} · {fecha.format(new Date(d.creado_en))}</p><p className="mt-1 text-xs text-muted-foreground">Cifras al {fecha.format(new Date(d.indicadores.calculado_en))} · {d.indicadores.zona_horaria}</p><ul className="mt-4 space-y-1 text-xs text-muted-foreground">{d.filtros_texto.map(f=><li key={f}>{f}</li>)}</ul></div>
    {lectura.length>0 && <section className="mt-7"><h3 className="text-lg font-semibold">Lectura del período</h3><ul className="mt-4 list-disc space-y-3 pl-5 text-sm">{lectura.map(h=><li key={h.posicion}>{h.texto}</li>)}</ul><p className="mt-3 text-xs text-muted-foreground">{AVISO_HALLAZGOS}</p></section>}
    {p.comentarios && <section className="mt-7 border-t border-border pt-6"><h3 className="text-lg font-semibold">Comentarios del equipo</h3><p className="mt-3 whitespace-pre-wrap text-sm">{p.comentarios}</p></section>}
    {informe.secciones_elegidas.map(s=><section key={s.id} className="mt-8 border-t border-border pt-6"><h3 className="text-lg font-semibold">{s.titulo}</h3><p className="mt-2 text-xs text-muted-foreground">{s.descripcion}</p>{!s.filas.length?<p className="mt-4 text-sm text-muted-foreground">Sin datos para este período y alcance</p>:<><GraficoInforme seccion={s} verde={p.tema==="verde"}/>{s.grafico&&s.grafico!=="matriz"?<details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-primary">Ver datos exactos</summary><TablaInforme seccion={s}/></details>:s.grafico!=="matriz"&&<TablaInforme seccion={s}/>}</>}</section>)}
    <details className="mt-8 border-t border-border pt-6"><summary className="cursor-pointer text-base font-semibold">Criterios y definiciones de cálculo</summary><dl className="mt-5 space-y-5 text-sm">{d.definiciones.map(c=><div key={c.indicador}><dt className="font-semibold">{c.indicador}</dt><dd className="mt-1 space-y-1 text-muted-foreground"><p>{c.fecha}</p><p>{c.formula}</p><p>{c.denominador}</p></dd></div>)}</dl></details>
    <p className="mt-7 text-xs text-muted-foreground">Uso interno del equipo de Convivencia, los gráficos describen registros y no corresponden a predicciones de conducta.</p>
  </article>;
}
