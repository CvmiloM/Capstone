"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CargaActiva, FormularioConCarga } from "@/app/components/actividad";
import { AvisoError, claseBotonPrimario, claseBotonSecundario } from "@/app/components/formulario";
import { buscarRegistroInforme, prepararInforme } from "./acciones";
import { controlInforme, PROPOSITOS, type AlcanceInforme, type OpcionInforme, type OpcionesInforme, type TipoInforme } from "./datos";
import { PasosInforme } from "./pasos";

export function AsistenteInforme({ opciones,solicitud,inicial }: { opciones: OpcionesInforme; solicitud:string; inicial?: Partial<AlcanceInforme> }) {
  const [paso,setPaso] = useState(1);
  const tituloPaso=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{if(paso===2)tituloPaso.current?.focus();},[paso]);
  const [tipo,setTipo] = useState<TipoInforme>(inicial?.tipo??"PERIODO");
  const [desde,setDesde] = useState(inicial?.desde??"");
  const [hasta,setHasta] = useState(inicial?.hasta??"");
  const [buscar,setBuscar] = useState("");
  const [seleccion,setSeleccion] = useState<OpcionInforme | null>(null);
  const [encontrados,setEncontrados] = useState<{ registros:OpcionInforme[]; pagina:number; hay_mas:boolean } | null>(null);
  const [errorBusqueda,setErrorBusqueda] = useState("");
  const [buscando,iniciarBusqueda] = useTransition();
  const [estado,accion,pendiente] = useActionState(prepararInforme,{});
  const limite = desde ? new Date(desde+"T12:00:00Z") : null;
  if(limite && Number.isFinite(limite.getTime()))limite.setUTCDate(limite.getUTCDate()+366);
  const maximo=limite && Number.isFinite(limite.getTime())?limite.toISOString().slice(0,10):undefined;
  const proposito=PROPOSITOS.find(p=>p.tipo===tipo)!;
  function consultarRegistros(pagina=1) {
    setErrorBusqueda("");
    setEncontrados(null);
    iniciarBusqueda(async()=>{
      const r=await buscarRegistroInforme({desde,hasta,tipo,buscar,pagina});
      if(r.ok)setEncontrados(r);else setErrorBusqueda(r.mensaje);
    });
  }
  const cambiarDesde=(valor:string)=>{setDesde(valor);if(hasta && valor>hasta)setHasta("");setSeleccion(null);setEncontrados(null);};
  const cambiarHasta=(valor:string)=>{setHasta(valor);setSeleccion(null);setEncontrados(null);};
  return <div className="space-y-7">
    <CargaActiva activa={buscando}/>
    <PasosInforme actual={paso}/>
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <section className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-7" aria-labelledby="tarea-informe">
        {paso===1 ? <>
          <h2 id="tarea-informe" className="text-xl font-semibold">¿Qué necesitas revisar?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Cada propósito tiene sus propios filtros y contenido, podrás personalizar el documento antes de publicarlo.</p>
          <div className="mt-6 divide-y divide-border">
            {PROPOSITOS.map(p=><button key={p.tipo} type="button" onClick={()=>{setTipo(p.tipo);setSeleccion(null);setEncontrados(null);setPaso(2);}}
              className="group flex w-full items-center justify-between gap-5 rounded-lg px-2 py-5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
              <span><span className="block text-base font-semibold text-primary">{p.titulo}</span><span className="mt-1.5 block max-w-2xl text-sm text-muted-foreground">{p.descripcion}</span></span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5 shrink-0 text-primary"><path d="m9 5 7 7-7 7"/></svg>
            </button>)}
          </div>
        </> : <FormularioConCarga action={accion}>
          <h2 id="tarea-informe" ref={tituloPaso} tabIndex={-1} className="text-xl font-semibold">¿Qué período quieres revisar?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Define las fechas y el alcance, no se muestran cifras hasta que solicites la consulta.</p>
          <input type="hidden" name="tipo" value={tipo}/><input type="hidden" name="solicitud" value={solicitud}/>
          <input type="hidden" name="anterior" value={inicial?.anterior??""}/>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Desde<input name="desde" type="date" required disabled={buscando||pendiente} value={desde} max={hasta||undefined} onInput={e=>cambiarDesde(e.currentTarget.value)} className={controlInforme}/></label>
            <label className="text-sm font-medium">Hasta<input name="hasta" type="date" required disabled={buscando||pendiente} value={hasta} min={desde||undefined} max={maximo} onInput={e=>cambiarHasta(e.currentTarget.value)} className={controlInforme}/></label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Ambas fechas se incluyen, hasta 367 días, según la zona horaria de tu escuela.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={()=>{setDesde(opciones.hoy.slice(0,4)+"-01-01");setHasta(opciones.hoy.slice(0,4)+"-12-31");setSeleccion(null);setEncontrados(null);}}>Usar año actual completo</button>
            <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={()=>{setDesde(opciones.hoy.slice(0,7)+"-01");setHasta(opciones.hoy);setSeleccion(null);setEncontrados(null);}}>Mes actual hasta hoy</button>
          </div>
          {tipo==="PERIODO" ? <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Nivel educativo<select name="nivel" defaultValue={inicial?.nivel??""} className={controlInforme}><option value="">Todos los niveles</option>{opciones.niveles.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
            <label className="text-sm font-medium">Curso<select name="curso" defaultValue={inicial?.curso??""} className={controlInforme}><option value="">Todos los cursos</option>{opciones.cursos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
            <label className="text-sm font-medium sm:col-span-2">Categoría<select name="categoria" defaultValue={inicial?.categoria??""} className={controlInforme}><option value="">Todas las categorías</option>{opciones.categorias.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
          </div> : <div className="mt-6 border-t border-border pt-6">
            <label htmlFor="buscar-registro" className="text-sm font-medium">{tipo==="ESTUDIANTE"?"Selecciona un estudiante":"Selecciona un caso"}</label>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <input id="buscar-registro" disabled={buscando||pendiente} value={buscar} onInput={e=>{setBuscar(e.currentTarget.value);setEncontrados(null);}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();consultarRegistros();}}}
                maxLength={120} placeholder={tipo==="ESTUDIANTE"?"Nombre, apellidos o código":"Código o título del caso"} className={controlInforme+" min-w-0 flex-1 !mt-0"}/>
              <button type="button" disabled={buscando} onClick={()=>consultarRegistros()} className={claseBotonSecundario}>{buscando?"Buscando…":"Buscar registro"}</button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Completa ambas fechas y busca por al menos dos caracteres.</p>
            {errorBusqueda && <p role="alert" className="mt-3 text-sm text-destructive">{errorBusqueda}</p>}
            {encontrados && <div className="mt-4">
              {!encontrados.registros.length && <p className="text-sm text-muted-foreground">No se encontraron registros, prueba con otro nombre o código.</p>}
              <ul className="divide-y divide-border">{encontrados.registros.map(r=><li key={r.id}><label className="flex cursor-pointer items-center gap-3 py-3 text-sm"><input type="radio" name="registro" checked={seleccion?.id===r.id} onChange={()=>setSeleccion(r)} className="size-4 accent-primary"/><span>{r.nombre}</span></label></li>)}</ul>
              <div className="mt-3 flex gap-4">{encontrados.pagina>1 && <button type="button" onClick={()=>consultarRegistros(encontrados.pagina-1)} className="text-sm text-primary">Anteriores</button>}{encontrados.hay_mas && <button type="button" onClick={()=>consultarRegistros(encontrados.pagina+1)} className="text-sm text-primary">Siguientes</button>}</div>
            </div>}
            {seleccion && <p className="mt-3 rounded-lg bg-accent p-3 text-sm text-accent-foreground">Seleccionado, {seleccion.nombre}</p>}
            <input type="hidden" name={tipo==="ESTUDIANTE"?"estudiante":"caso"} value={seleccion?.id??""}/>
          </div>}
          <div className="mt-7 border-t border-border pt-5"><h3 className="text-sm font-semibold">Después podrás personalizar el contenido</h3><p className="mt-1 text-sm text-muted-foreground">Elige gráficos, tablas, comentarios y el título de tu informe en el siguiente paso.</p></div>
          {estado.mensaje && <div className="mt-5"><AvisoError>{estado.mensaje}</AvisoError></div>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={()=>setPaso(1)} disabled={pendiente||buscando} className={claseBotonSecundario}>Volver al propósito</button>
            <button type="submit" disabled={pendiente || buscando || tipo!=="PERIODO"&&!seleccion} className={claseBotonPrimario}>{pendiente?"Consultando registros…":"Consultar y continuar"}</button>
          </div>
        </FormularioConCarga>}
      </section>
      <section className="border-t border-border pt-5" aria-label="Resumen del informe">
        <h2 className="text-base font-semibold">Tu informe</h2>
        <dl className="mt-5 space-y-5 text-sm"><div><dt className="text-muted-foreground">Propósito</dt><dd className="mt-1 font-medium">{paso===1?"Por elegir":proposito.titulo}</dd></div><div><dt className="text-muted-foreground">Período</dt><dd className="mt-1">{desde&&hasta?desde+" al "+hasta:"Fechas por seleccionar"}</dd></div>{seleccion && <div><dt className="text-muted-foreground">Registro</dt><dd className="mt-1 break-words">{seleccion.nombre}</dd></div>}<div><dt className="text-muted-foreground">Contenido</dt><dd className="mt-1">Se personaliza después de consultar</dd></div></dl>
        {inicial?.anterior && <p className="mt-5 text-sm text-muted-foreground">Esta será una nueva edición, la publicación anterior se conserva.</p>}
        <p className="mt-8 text-xs text-muted-foreground">Revisa el documento completo antes de publicarlo, sus archivos quedan disponibles solo para Convivencia.</p>
      </section>
    </div>
  </div>;
}
