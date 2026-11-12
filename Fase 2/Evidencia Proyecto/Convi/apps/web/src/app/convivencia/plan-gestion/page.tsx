import { Encabezado, claseBotonPrimario } from "@/app/components/formulario";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { pedir } from "../datos";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { BusquedaGestion, ListaGestion } from "./lista";
import { RAIZ, type Lista } from "./opciones";

export const metadata = { title: "Plan de Gestión de Convivencia" };
export default async function Planes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams,
    parametros: Record<string, string> = {};
  for (const k of ["q", "anio", "pagina"])
    if (typeof p[k] === "string") parametros[k] = p[k] as string;
  const r = await pedir<Lista>(
    `/convivencia/gestion?${new URLSearchParams(parametros)}`,
  );
  if (!r.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <Encabezado
          titulo="Plan de Gestión de Convivencia"
          descripcion="Organiza los objetivos, acciones y actividades de convivencia de tu escuela durante el año académico."
        />
        <Link href={`${RAIZ}/nuevo`} className={claseBotonPrimario}>
          Crear Plan
        </Link>
      </div>
      <BusquedaGestion ruta={RAIZ} parametros={parametros} anio anios={r.datos.anios} />
      <ListaGestion lista={r.datos} tipo="planes" parametros={parametros} />
    </div>
  );
}
