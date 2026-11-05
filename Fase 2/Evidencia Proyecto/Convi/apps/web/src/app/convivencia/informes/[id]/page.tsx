import { Encabezado, claseBotonSecundario } from "@/app/components/formulario";
import { EnlaceConCarga } from "@/app/components/actividad";
import { pedir } from "../../datos";
import { AvisoNoDisponible } from "../../aviso-no-disponible";
import { ContenidoInforme, PublicarInforme } from "../contenido";
import { PasosInforme } from "../pasos";
import { VistaInforme } from "../vista";
import type { Informe } from "../datos";
import { DescargarPlanillaInforme } from "../descarga";

export const metadata={ title:"Revisar informe de Convivencia" };
export default async function PaginaInforme({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{paso?:string}>}) {
  const {id}=await params;
  const {paso}=await searchParams;
  const r=await pedir<Informe>("/convivencia/informes/"+encodeURIComponent(id));
  if(!r.ok)return <AvisoNoDisponible volverA="/convivencia/informes"/>;
  const informe=r.datos;
  const publicado=informe.estado==="PUBLICADO";
  const d=informe.definiciones_calculo;
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><Encabezado titulo={publicado?"Informe publicado":paso==="contenido"?"Personaliza el informe":"Revisa antes de publicar"} descripcion={publicado?"Los archivos y criterios de esta publicación se conservan":"Comprueba el contenido y las cifras antes de conservar los archivos"}/><EnlaceConCarga href="/convivencia/informes/guardados" className="py-2 text-sm text-primary underline-offset-4 hover:underline">Informes guardados</EnlaceConCarga></div>
    {!publicado&&paso==="contenido"?<ContenidoInforme informe={{id,revision:informe.revision,definiciones_calculo:{escuela:d.escuela,alcance:d.alcance,sujeto:d.sujeto,presentacion:d.presentacion,indicadores:{total_situaciones:d.indicadores.total_situaciones},secciones:d.secciones.map(s=>({id:s.id,titulo:s.titulo,descripcion:s.descripcion}))}}}/>:<>
      {!publicado&&<PasosInforme actual={4}/>}
      <div className="flex flex-wrap gap-3">
        <a href={"/convivencia/informes/"+id+"/archivo/pdf?ver=1"} target="_blank" rel="noopener noreferrer" className={claseBotonSecundario}>{publicado?"Abrir PDF conservado":"Abrir vista previa PDF"}</a>
        <DescargarPlanillaInforme id={id} publicado={publicado}/>
        {!publicado?<EnlaceConCarga href={"/convivencia/informes/"+id+"?paso=contenido"} className={claseBotonSecundario}>Ajustar contenido</EnlaceConCarga>:<EnlaceConCarga href={"/convivencia/informes?anterior="+id} className={claseBotonSecundario}>Crear nueva edición</EnlaceConCarga>}
      </div>
      {informe.informe_anterior_id && <EnlaceConCarga href={"/convivencia/informes/"+informe.informe_anterior_id} className="inline-block text-sm text-primary underline-offset-4 hover:underline">Consultar la edición anterior</EnlaceConCarga>}
      <VistaInforme informe={informe}/>
      {!publicado&&<section className="rounded-2xl border border-border bg-card p-5"><h2 className="mb-3 text-lg font-semibold">Conservar esta versión</h2><PublicarInforme id={id} revision={informe.revision}/></section>}
    </>}
  </div>;
}
