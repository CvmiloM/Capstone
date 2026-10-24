import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado } from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { formatearDia } from "../casos/datos";
import { obtenerProtocolos } from "./datos";
import { FormularioProtocolo } from "./formularios";

export const metadata: Metadata = { title: "Protocolos" };

// PB-081 y PB-083: protocolos de la escuela. Cada uno se prepara en
// versiones: un Borrador con sus pasos que, revisado, se publica y desde ese
// día se puede aplicar a los casos (PB-082).
export default async function PaginaProtocolos() {
  const respuesta = await obtenerProtocolos();
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const protocolos = respuesta.datos;

  return (
    <>
      <Encabezado
        titulo="Protocolos"
        descripcion="Los protocolos de actuación de la escuela. Cada versión se prepara en borrador con sus pasos y, una vez revisada, se publica para aplicarla en los casos."
      />
      {protocolos.length === 0 ? (
        <p className="mb-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-tarjeta">
          Todavía no hay protocolos. Crea el primero más abajo.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {protocolos.map((protocolo) => (
            <li key={protocolo.id}>
              <Link
                href={`/convivencia/protocolos/${protocolo.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted-foreground">{protocolo.codigo}</p>
                  <p className="mt-1 font-semibold">{protocolo.nombre}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {protocolo.version_publicada
                      ? `Versión ${protocolo.version_publicada} publicada${protocolo.vigente_desde ? `, rige desde el ${formatearDia(protocolo.vigente_desde)}` : ""}`
                      : "Sin versión publicada"}
                    {protocolo.borrador_numero &&
                      ` · versión ${protocolo.borrador_numero} en borrador`}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {protocolo.versiones === 1 ? "1 versión" : `${protocolo.versiones} versiones`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
        <h2 className="mb-3 text-base font-semibold">Nuevo protocolo</h2>
        <FormularioProtocolo />
      </section>
    </>
  );
}
