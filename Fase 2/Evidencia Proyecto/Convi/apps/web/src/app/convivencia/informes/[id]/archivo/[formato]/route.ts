import { responderDescarga } from "@/app/components/evidencias/datos";
export async function GET(request:Request,{params}:{params:Promise<{id:string;formato:string}>}) {
  const {id,formato}=await params;
  if(!["pdf","xlsx"].includes(formato))return new Response("Formato no disponible",{status:404,headers:{"Cache-Control":"private, no-store"}});
  const r=await responderDescarga("/convivencia/informes/"+encodeURIComponent(id)+"/archivo/"+formato,"El informe no está disponible para esta cuenta");
  if(r.ok&&formato==="pdf"&&new URL(request.url).searchParams.get("ver")==="1")r.headers.set("Content-Disposition",'inline; filename="informe-convi.pdf"');
  return r;
}
