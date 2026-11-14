"use client";
import { Icono } from "@/app/components/icono";
import { useState } from "react";
import { CargaActiva } from "@/app/components/actividad";
import { claseBotonSecundario } from "@/app/components/formulario";
export function DescargarPlanillaInforme({id,publicado}:{id:string;publicado:boolean}) {
  const [pendiente,setPendiente]=useState(false);
  const [error,setError]=useState("");
  async function descargar() {
    setPendiente(true);setError("");
    try {
      const r=await fetch("/convivencia/informes/"+id+"/archivo/xlsx",{cache:"no-store"});
      if(!r.ok || !r.headers.get("Content-Type")?.includes("spreadsheetml"))throw new Error();
      const url=URL.createObjectURL(await r.blob());
      const enlace=document.createElement("a");enlace.href=url;enlace.download="informe-convi.xlsx";enlace.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    } catch {setError("No pudimos descargar la planilla, recarga la página y vuelve a intentar");}
    finally {setPendiente(false);}
  }
  return <div><CargaActiva activa={pendiente}/><button type="button" onClick={descargar} disabled={pendiente} className={claseBotonSecundario}><Icono nombre="descargar" className="mr-1.5 size-4 shrink-0" />{pendiente?"Preparando planilla…":publicado?"Descargar XLSX conservado":"Descargar vista previa XLSX"}</button>{error&&<p role="alert" className="mt-2 max-w-sm text-sm text-destructive">{error}</p>}</div>;
}
