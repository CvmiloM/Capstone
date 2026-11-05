import { EnlaceConCarga } from "@/app/components/actividad";
import { Encabezado, claseBotonPrimario } from "@/app/components/formulario";
import { pedir } from "../../datos";
import { AvisoNoDisponible } from "../../aviso-no-disponible";

export const metadata={title:"Informes guardados"};
export default async function PaginaGuardados({searchParams}:{searchParams:Promise<{pagina?:string}>}) {
  const {pagina}=await searchParams;
  const r=await pedir<{informes:{id:string;titulo:string;estado:string;periodo_desde:string;periodo_hasta:string}[];pagina:number;hay_mas:boolean}>("/convivencia/informes?"+new URLSearchParams({pagina:pagina??"1"}));
  if(!r.ok)return <AvisoNoDisponible volverA="/convivencia/informes"/>;
  const d=r.datos;
  return <div className="mx-auto max-w-5xl">
    <div className="flex flex-wrap items-start justify-between gap-3"><Encabezado titulo="Informes guardados" descripcion="Publicaciones de tu escuela y borradores preparados por ti"/><EnlaceConCarga href="/convivencia/informes" className={claseBotonPrimario}>Crear informe</EnlaceConCarga></div>
    <div className="rounded-2xl border border-border bg-card p-5">{!d.informes.length?<p className="py-6 text-sm text-muted-foreground">Todavía no hay informes en esta página, crea uno para consultar y ordenar tus registros.</p>:<ul className="divide-y divide-border">{d.informes.map(f=><li key={f.id} className="py-5"><EnlaceConCarga href={"/convivencia/informes/"+f.id+(f.estado==="BORRADOR"?"?paso=contenido":"")} className="break-words font-semibold text-primary underline-offset-4 hover:underline">{f.titulo}</EnlaceConCarga><p className="mt-1 text-sm text-muted-foreground">{f.periodo_desde} al {f.periodo_hasta} · {f.estado==="PUBLICADO"?"Publicado, archivos conservados":"Borrador propio"}</p></li>)}</ul>}</div>
    <nav aria-label="Páginas de informes" className="mt-5 flex gap-5 text-sm text-primary">{d.pagina>1&&<EnlaceConCarga href={"/convivencia/informes/guardados?pagina="+(d.pagina-1)}>Anteriores</EnlaceConCarga>}{d.hay_mas&&<EnlaceConCarga href={"/convivencia/informes/guardados?pagina="+(d.pagina+1)}>Siguientes</EnlaceConCarga>}</nav>
  </div>;
}
