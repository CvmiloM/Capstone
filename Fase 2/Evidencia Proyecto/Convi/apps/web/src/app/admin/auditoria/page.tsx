import type { Metadata } from "next";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Encabezado, claseEnlace } from "@/app/components/formulario";
import { ListaHistorial } from "@/app/components/auditoria/lista-historial";
import { obtenerContextoAdmin } from "../datos";
import { obtenerAuditoria } from "./datos";
import { FiltrosAuditoria, type Filtros } from "./filtros";

export const metadata: Metadata = { title: "Auditoría" };

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const consulta = await searchParams;
  const { antes } = consulta;
  const campos = [
    "colaborador",
    "fecha",
    "desde",
    "hasta",
    "palabras",
    "recurso",
    "accion",
    "resultado",
  ] as const;
  const filtros = Object.fromEntries(
    campos.map((c) => [c, typeof consulta[c] === "string" ? consulta[c].trim() : ""]),
  ) as Filtros;
  const parametros = new URLSearchParams();
  campos.forEach((c) => {
    if (filtros[c]) parametros.set(c, filtros[c]);
  });
  const ruta = `/admin/auditoria${parametros.size ? `?${parametros}` : ""}`;
  const [pagina, contexto] = await Promise.all([
    obtenerAuditoria(consulta),
    obtenerContextoAdmin(),
  ]);
  const formato = new Intl.DateTimeFormat("es-CL", {
    timeZone: contexto.escuela.zonaHoraria,
    dateStyle: "long",
    timeStyle: "short",
  });
  return (
    <>
      <Encabezado
        titulo="Auditoría"
        descripcion="Consulta quién hizo cada cambio, cuándo y sobre qué registro, el contenido de los expedientes permanece reservado a Convivencia"
      />
      {pagina && parametros.size === 0 ? (
        <div className="max-w-4xl space-y-4">
          <FiltrosAuditoria inicial={filtros} opciones={pagina.opciones} />
          <p className="text-sm text-muted-foreground">
            Aplica al menos un filtro para consultar los registros.
          </p>
        </div>
      ) : pagina ? (
        <ListaHistorial
          pagina={pagina}
          ruta={ruta}
          anteriores={Boolean(antes)}
          fecha={(valor) => formato.format(new Date(valor))}
          filtros={
            <FiltrosAuditoria
              key={parametros.toString()}
              inicial={filtros}
              opciones={pagina.opciones}
            />
          }
        />
      ) : (
        <p
          role="alert"
          className="rounded-2xl border border-border bg-card p-5"
        >
          Los filtros o la página del historial no son válidos,{" "}
          <Link href="/admin/auditoria" className={claseEnlace}>
            volver a la búsqueda
          </Link>
        </p>
      )}
    </>
  );
}
