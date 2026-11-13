"use client";

import { useActionState, useState } from "react";
import { EnlaceConCarga, FormularioConCarga } from "@/app/components/actividad";
import { AvisoError, claseBotonPrimario, claseBotonSecundario } from "@/app/components/formulario";
import { guardarContenidoInforme, publicarInforme } from "./acciones";
import { AVISO_HALLAZGOS, controlInforme, hallazgosConPosicion, type Informe } from "./datos";
import { PasosInforme } from "./pasos";
import { useCambiosSinGuardar } from "./cambios-sin-guardar";

export type DatosContenidoInforme=Pick<Informe,"id"|"revision">&{definiciones_calculo:Pick<Informe["definiciones_calculo"],"escuela"|"alcance"|"sujeto"|"presentacion"|"hallazgos">&{indicadores:{total_situaciones:number};secciones:Pick<Informe["secciones_elegidas"][number],"id"|"titulo"|"descripcion">[]}};
export function ContenidoInforme({ informe }: { informe:DatosContenidoInforme }) {
  const d=informe.definiciones_calculo;
  const [p,setP]=useState(d.presentacion);
  const [estado,accion,pendiente]=useActionState(guardarContenidoInforme.bind(null,informe.id),{});
  const cambiado=JSON.stringify(p)!==JSON.stringify(d.presentacion);
  useCambiosSinGuardar(cambiado,pendiente);
  const secciones=d.secciones.filter(s=>s.id!=="evolucion_dia");
  const hallazgos=hallazgosConPosicion(d.hallazgos);
  const omitidos=p.hallazgos_omitidos??[];
  return <div className="space-y-7">
    <PasosInforme actual={3}/>
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <FormularioConCarga action={accion} className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <input type="hidden" name="revision" value={informe.revision}/>
        <h2 className="text-xl font-semibold">Dale forma al informe</h2>
        <p className="mt-2 text-sm text-muted-foreground">La consulta ya está preparada, elige qué incluir y cómo presentar sus resultados.</p>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Título<input name="titulo" required maxLength={220} value={p.titulo} onChange={e=>setP({...p,titulo:e.target.value})} className={controlInforme}/></label>
          <label className="block text-sm font-medium">Subtítulo opcional<input name="subtitulo" maxLength={300} value={p.subtitulo} onChange={e=>setP({...p,subtitulo:e.target.value})} className={controlInforme}/></label>
        </div>
        <fieldset className="mt-7 border-t border-border pt-5"><legend className="pr-3 text-base font-semibold">Secciones del informe</legend>
          <p className="mt-2 text-xs text-muted-foreground">Elige al menos una, la evolución mensual usa barras verticales, las comparaciones de grupos usan barras horizontales y las categorías entre meses se muestran en una matriz.</p>
          <div className="mt-4 space-y-3">{secciones.map(s=><label key={s.id} className="flex cursor-pointer items-start gap-3 text-sm">
            <input name="secciones" type="checkbox" value={s.id} checked={p.secciones.includes(s.id)} onChange={e=>setP({...p,secciones:e.target.checked?[...p.secciones,s.id]:p.secciones.filter(id=>id!==s.id)})} className="mt-1 size-4 shrink-0 accent-primary"/>
            <span><span className="font-medium">{s.id==="evolucion_mes"?"Evolución de situaciones en el tiempo":s.titulo}</span><span className="mt-0.5 block text-xs text-muted-foreground">{s.descripcion}</span></span>
          </label>)}</div>
        </fieldset>
        {/* Refinamientos de Convivencia, anexo de insights: la lectura del período se arma con las cifras de este corte, sin IA, y cada hallazgo se puede quitar. */}
        {hallazgos.length>0 && <fieldset className="mt-7 border-t border-border pt-5"><legend className="pr-3 text-base font-semibold">Lectura del período</legend>
          <input type="hidden" name="hallazgos_total" value={d.hallazgos.length}/>
          <p className="mt-2 text-xs text-muted-foreground">CONVI arma estos hallazgos con las cifras de este informe, sin IA, cada uno indica la sección que lo respalda, desmarca los que no quieras incluir y si los quitas todos el informe no lleva esta lectura.</p>
          <div className="mt-4 space-y-3">{hallazgos.map(h=><label key={h.posicion} className="flex cursor-pointer items-start gap-3 text-sm">
            <input name="hallazgos" type="checkbox" value={h.posicion} checked={!omitidos.includes(h.posicion)} onChange={e=>setP({...p,hallazgos_omitidos:e.target.checked?omitidos.filter(n=>n!==h.posicion):[...omitidos,h.posicion]})} className="mt-1 size-4 shrink-0 accent-primary"/>
            <span>{h.texto}</span>
          </label>)}</div>
          <p className="mt-3 text-xs text-muted-foreground">Siempre se agrega al final: {AVISO_HALLAZGOS}.</p>
        </fieldset>}
        <fieldset className="mt-7 border-t border-border pt-5"><legend className="pr-3 text-base font-semibold">Presentación</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Agrupación temporal<select name="agrupacion" value={p.agrupacion} onChange={e=>setP({...p,agrupacion:e.target.value as "mes"|"dia"})} className={controlInforme}><option value="mes">Por mes</option><option value="dia">Por día</option></select></label>
            <label className="text-sm font-medium">Acento del documento<select name="tema" value={p.tema} onChange={e=>setP({...p,tema:e.target.value as "azul"|"verde"})} className={controlInforme}><option value="azul">Azul institucional</option><option value="verde">Verde CONVI</option></select></label>
          </div>
          <label className="mt-5 flex items-center gap-3 text-sm"><input type="checkbox" name="portada" checked={p.portada} onChange={e=>setP({...p,portada:e.target.checked})} className="size-4 accent-primary"/>Incluir portada en el PDF</label>
          <label className="mt-3 flex items-center gap-3 text-sm"><input type="checkbox" name="tablas" checked={p.tablas} onChange={e=>setP({...p,tablas:e.target.checked})} className="size-4 accent-primary"/>Incluir tablas numéricas junto a los gráficos del PDF</label>
          <p className="mt-2 text-xs text-muted-foreground">La planilla siempre conserva los datos completos de las secciones elegidas, el período, los filtros y los criterios se incluyen en ambos formatos.</p>
        </fieldset>
        <label className="mt-7 block border-t border-border pt-5 text-sm font-medium">Comentarios del equipo<textarea name="comentarios" rows={5} maxLength={5000} value={p.comentarios} onChange={e=>setP({...p,comentarios:e.target.value})} placeholder="Añade contexto, acuerdos o acciones que quieras dejar por escrito" className={controlInforme}/></label>
        {estado.mensaje && <div className="mt-5"><AvisoError>{estado.mensaje}</AvisoError></div>}
        <p role="status" className="mt-5 text-xs text-muted-foreground">{cambiado?"Tienes cambios sin guardar. Guárdalos antes de salir para conservarlos.":"Estás viendo la personalización guardada de este borrador."}</p>
        <div className="mt-6 flex flex-wrap gap-3"><EnlaceConCarga href={`/convivencia/informes?retomar=${informe.id}`} className={claseBotonSecundario}>Cambiar el alcance</EnlaceConCarga><button type="submit" disabled={pendiente||!p.secciones.length} className={claseBotonPrimario}>{pendiente?"Guardando cambios…":"Guardar cambios y revisar"}</button></div>
      </FormularioConCarga>
      <section className="border-t border-border pt-5"><h2 className="font-semibold">Tu informe</h2><dl className="mt-5 space-y-5 text-sm"><div><dt className="text-muted-foreground">Escuela</dt><dd className="mt-1">{d.escuela}</dd></div><div><dt className="text-muted-foreground">Período</dt><dd className="mt-1">{d.alcance.desde} al {d.alcance.hasta}</dd></div>{d.sujeto && <div><dt className="text-muted-foreground">Registro seleccionado</dt><dd className="mt-1 break-words">{d.sujeto}</dd></div>}<div><dt className="text-muted-foreground">Corte preparado</dt><dd className="mt-1">{d.indicadores.total_situaciones} situaciones distintas</dd></div></dl><p className="mt-7 text-xs text-muted-foreground">La personalización usa las cifras de esta consulta, si necesitas datos nuevos vuelve a definir el alcance.</p></section>
    </div>
  </div>;
}

export function PublicarInforme({ id,revision }: { id:string; revision:string }) {
  const [estado,accion,pendiente]=useActionState(publicarInforme.bind(null,id),{});
  return <FormularioConCarga action={accion} className="space-y-4">
    <input name="revision" type="hidden" value={revision}/>
    <p className="max-w-2xl text-sm text-muted-foreground">Al publicar se conservan el PDF, la planilla y los criterios de este corte, una corrección requiere otra edición.</p>
    {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
    <button type="submit" disabled={pendiente} className={claseBotonPrimario}>{pendiente?"Conservando los archivos…":"Publicar y conservar archivos"}</button>
  </FormularioConCarga>;
}
