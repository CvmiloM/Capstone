import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace } from "@/app/components/formulario";
import { obtenerFormatoFecha } from "@/app/profesor/datos";
import { AvisoNoDisponible } from "../../aviso-no-disponible";
import { formatearDia } from "../../casos/datos";
import { obtenerProtocolo } from "../datos";
import { BotonNuevaVersion } from "../formularios";
import { NOMBRE_ESTADO_VERSION } from "../opciones";

export const metadata: Metadata = { title: "Protocolo" };

const AVISOS: Record<string, string> = {
  creado:
    "Creaste el protocolo. Su versión 1 quedó en borrador: agrégale los pasos y, cuando esté revisada, publícala.",
};

// PB-081 y PB-083: un protocolo con todas sus versiones, de la más nueva a la
// más antigua. Solo puede haber una versión en borrador a la vez.
export default async function PaginaProtocolo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const [respuesta, formatearFecha] = await Promise.all([obtenerProtocolo(id), obtenerFormatoFecha()]);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia/protocolos" />;
  const protocolo = respuesta.datos;
  const textoAviso = aviso ? AVISOS[aviso] : undefined;

  return (
    <>
      <Link href="/convivencia/protocolos" className={`text-sm ${claseEnlace}`}>
        ← Protocolos
      </Link>

      {textoAviso && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm"
        >
          {textoAviso}
        </div>
      )}

      <div className="mt-4 mb-6">
        <p className="font-mono text-sm text-muted-foreground">{protocolo.codigo}</p>
        <h1 className="mt-1 text-2xl font-semibold">{protocolo.nombre}</h1>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
        <h2 className="mb-3 text-base font-semibold">Versiones</h2>
        <ul className="divide-y divide-border text-sm">
          {protocolo.versiones.map((v) => (
            <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div>
                <p className="font-medium">
                  <Link
                    href={`/convivencia/protocolos/versiones/${v.id}`}
                    className={claseEnlace}
                  >
                    Versión {v.numero_version}
                  </Link>
                  <span className="ml-2 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                    {NOMBRE_ESTADO_VERSION[v.estado] ?? v.estado}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[
                    v.pasos === 1 ? "1 paso" : `${v.pasos} pasos`,
                    v.documento_origen ?? "Sin documento de origen",
                    v.vigente_desde &&
                      `Rige desde el ${formatearDia(v.vigente_desde)}${v.vigente_hasta ? ` hasta el ${formatearDia(v.vigente_hasta)}` : ""}`,
                    v.publicado_en &&
                      `Publicada por ${v.revisado_por} el ${formatearFecha(v.publicado_en)}`,
                    `Creada por ${v.creado_por} el ${formatearFecha(v.creado_en)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {v.estado === "BORRADOR" && (
                <Link
                  href={`/convivencia/protocolos/versiones/${v.id}`}
                  className={`text-sm ${claseEnlace}`}
                >
                  Editar borrador
                </Link>
              )}
            </li>
          ))}
        </ul>
        {!protocolo.borrador_id && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-sm text-muted-foreground">
              Para cambiar los pasos se crea una versión nueva, que parte con los
              pasos de la última. La versión publicada sigue rigiendo hasta que
              publiques la nueva.
            </p>
            <BotonNuevaVersion protocoloId={protocolo.id} />
          </div>
        )}
      </section>
    </>
  );
}
