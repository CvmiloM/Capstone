import { randomUUID } from "node:crypto";
import { Encabezado } from "@/app/components/formulario";
import { EnlaceConCarga } from "@/app/components/actividad";
import { pedir } from "../datos";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { AsistenteInforme } from "./asistente";
import type { Informe, OpcionesInforme } from "./datos";

export const metadata = { title:"Informes de Convivencia" };
export default async function PaginaInformes({ searchParams }: { searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  const parametros=await searchParams;
  const r=await pedir<OpcionesInforme>("/convivencia/informes/opciones");
  if(!r.ok)return <AvisoNoDisponible volverA="/convivencia"/>;
  let inicial;
  if(typeof parametros.anterior==="string"){
    const anterior=await pedir<Informe>("/convivencia/informes/"+encodeURIComponent(parametros.anterior));
    if(!anterior.ok || anterior.datos.estado!=="PUBLICADO")return <AvisoNoDisponible volverA="/convivencia/informes"/>;
    inicial={...anterior.datos.definiciones_calculo.alcance,anterior:anterior.datos.id};
  }
  return <div className="mx-auto max-w-6xl">
    <div className="mb-2 flex flex-wrap items-start justify-between gap-3"><Encabezado titulo="Informes de convivencia" descripcion="Elige qué necesitas revisar y prepara un informe a tu medida"/><EnlaceConCarga href="/convivencia/informes/guardados" className="py-2 text-sm font-medium text-primary underline-offset-4 hover:underline">Informes guardados</EnlaceConCarga></div>
    <AsistenteInforme opciones={r.datos} solicitud={randomUUID()} inicial={inicial}/>
  </div>;
}
