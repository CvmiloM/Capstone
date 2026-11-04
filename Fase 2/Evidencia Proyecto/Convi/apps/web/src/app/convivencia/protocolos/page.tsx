import type { Metadata } from "next";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Encabezado } from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { formatearDia } from "../casos/datos";
import { obtenerProtocolos, type ProtocoloLista } from "./datos";
import { FormularioProtocolo } from "./formularios";

export const metadata: Metadata = { title: "Protocolos" };

// PB-081 y PB-083: protocolos de la escuela. Cada uno se prepara en
// versiones: un Borrador con sus pasos que, revisado, se publica y desde ese
// día se puede aplicar a los casos (PB-082).
export default async function PaginaProtocolos() {
  const respuesta = await obtenerProtocolos();
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  // PB-124 (HU-105): las propuestas de la IA van aparte y marcadas como no oficiales.
  const protocolos = respuesta.datos.filter((p) => p.naturaleza !== "PROPUESTA_IA");
  const propuestas = respuesta.datos.filter((p) => p.naturaleza === "PROPUESTA_IA");

  return (
    <>
      <Encabezado
        titulo="Protocolos"
        descripcion="Los protocolos de actuación de la escuela. Cada versión se prepara en borrador con sus pasos y, una vez revisada, se publica para aplicarla en los casos."
      />
      {protocolos.length === 0 ? (
        <p className="mb-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-tarjeta">
          Todavía no hay protocolos oficiales. Crea el primero más abajo.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {protocolos.map((protocolo) => (
            <li key={protocolo.id}>
              <TarjetaProtocolo protocolo={protocolo} />
            </li>
          ))}
        </ul>
      )}
      {propuestas.length > 0 && (
        <section className="mb-6" aria-labelledby="propuestas-ia">
          <h2 id="propuestas-ia" className="text-base font-semibold">
            Propuestas de la IA, no oficiales
          </h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            Pasos que la IA propuso desde un caso sin protocolo oficial, con sus
            fuentes del reglamento: se revisan y publican igual que un protocolo,
            con revisor y documento de origen, pero nunca pasan a ser oficiales
          </p>
          <ul className="space-y-3">
            {propuestas.map((protocolo) => (
              <li key={protocolo.id}>
                <TarjetaProtocolo protocolo={protocolo} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
        <h2 className="mb-3 text-base font-semibold">Nuevo protocolo</h2>
        <FormularioProtocolo />
      </section>
    </>
  );
}

function TarjetaProtocolo({ protocolo }: { protocolo: ProtocoloLista }) {
  const propuesta = protocolo.naturaleza === "PROPUESTA_IA";
  return (
    <Link
      href={`/convivencia/protocolos/${protocolo.id}`}
      className={`flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-center ${propuesta ? "border-dashed border-amarillo" : "border-border"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-muted-foreground">{protocolo.codigo}</p>
        <p className="mt-1 font-semibold">{protocolo.nombre}</p>
        {propuesta && (
          <span className="mt-1.5 inline-flex rounded-full bg-amarillo/20 px-2.5 py-0.5 text-xs font-medium text-foreground">
            Propuesta IA, no oficial
          </span>
        )}
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
  );
}
