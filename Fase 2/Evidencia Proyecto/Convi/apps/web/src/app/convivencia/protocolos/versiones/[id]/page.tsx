import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { claseEnlace } from "@/app/components/formulario";
import { formatearFecha } from "@/app/profesor/datos";
import { AvisoNoDisponible } from "../../../aviso-no-disponible";
import { formatearDia } from "../../../casos/datos";
import { obtenerVersion } from "../../datos";
import {
  FormularioDatosVersion,
  FormularioPaso,
  FormularioPublicacion,
} from "../../formularios";
import { NOMBRE_ESTADO_VERSION, textoPlazo } from "../../opciones";

export const metadata: Metadata = { title: "Versión del protocolo" };

const AVISOS: Record<string, string> = {
  version:
    "Creaste una versión nueva en borrador, con los pasos de la anterior. Cámbialos y publícala cuando esté revisada.",
  datos: "Guardaste los datos de la versión.",
  paso: "Guardaste el paso.",
  publicada:
    "Publicaste la versión. Desde la fecha indicada se puede aplicar a los casos; ya no cambia.",
};

// PB-081 (HU-070) y PB-083 (HU-072): una versión del protocolo con sus pasos.
// En Borrador se editan los datos y los pasos, y se publica; publicada se
// muestra tal cual, porque no cambia (CA3).
export default async function PaginaVersionProtocolo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const respuesta = await obtenerVersion(id);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia/protocolos" />;
  const version = respuesta.datos;
  const borrador = version.estado === "BORRADOR";
  const textoAviso = aviso ? AVISOS[aviso] : undefined;
  const siguienteOrden =
    Math.max(0, ...version.pasos_detalle.map((p) => p.orden_paso)) + 1;

  return (
    <>
      <Link
        href={`/convivencia/protocolos/${version.protocolo_id}`}
        className={`text-sm ${claseEnlace}`}
      >
        ← {version.protocolo_nombre}
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
        <p className="font-mono text-sm text-muted-foreground">
          {version.protocolo_codigo}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {version.protocolo_nombre} · versión {version.numero_version}
        </h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            {NOMBRE_ESTADO_VERSION[version.estado] ?? version.estado}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion titulo="Pasos" className="lg:col-span-2">
          {version.pasos_detalle.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no tiene pasos.
            </p>
          ) : (
            <ol className="space-y-3">
              {version.pasos_detalle.map((paso) => (
                <li key={paso.id} className="rounded-xl border border-border p-4 text-sm">
                  <p className="font-medium">
                    {paso.orden_paso}. {paso.nombre}
                  </p>
                  {paso.descripcion && (
                    <p className="mt-1 whitespace-pre-line text-muted-foreground">
                      {paso.descripcion}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                      {textoPlazo(paso.valor_plazo, paso.unidad_plazo)}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                      {paso.es_obligatorio ? "Obligatorio" : "Opcional"}
                    </span>
                    {paso.requiere_evidencia && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                        Exige evidencia
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                      Responsable: Convivencia
                    </span>
                  </div>
                  {borrador && (
                    <details className="mt-3 border-t border-border pt-3">
                      <summary className={`cursor-pointer text-sm ${claseEnlace}`}>
                        Editar paso
                      </summary>
                      <div className="mt-3">
                        <FormularioPaso versionId={version.id} paso={paso} />
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          )}
          {borrador && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="mb-3 text-sm font-semibold">Agregar un paso</h3>
              <FormularioPaso versionId={version.id} ordenSugerido={siguienteOrden} />
            </div>
          )}
        </Seccion>

        <div className="space-y-4">
          <Seccion titulo="Datos de la versión">
            <dl className="mb-4 space-y-3 text-sm">
              <Dato nombre="Creada">
                {formatearFecha(version.creado_en)} por {version.creado_por}
              </Dato>
              {version.publicado_en && (
                <Dato nombre="Publicada">
                  {formatearFecha(version.publicado_en)} por {version.revisado_por}
                </Dato>
              )}
              {version.vigente_desde && (
                <Dato nombre="Vigencia">
                  Desde el {formatearDia(version.vigente_desde)}
                  {version.vigente_hasta &&
                    ` hasta el ${formatearDia(version.vigente_hasta)}`}
                </Dato>
              )}
              {!borrador && (
                <>
                  <Dato nombre="Documento de origen">
                    {version.documento_origen ?? "Sin documento"}
                  </Dato>
                  {version.notas && <Dato nombre="Notas">{version.notas}</Dato>}
                </>
              )}
            </dl>
            {borrador && (
              <FormularioDatosVersion
                versionId={version.id}
                documentoActual={version.version_documento_origen_id}
                notasActuales={version.notas}
                documentos={version.documentos_origen}
              />
            )}
          </Seccion>

          {borrador && (
            <Seccion titulo="Publicar">
              <FormularioPublicacion versionId={version.id} hoy={version.hoy} />
            </Seccion>
          )}
        </div>
      </div>
    </>
  );
}

function Seccion({
  titulo,
  className = "",
  children,
}: {
  titulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card p-5 shadow-tarjeta ${className}`}
    >
      <h2 className="mb-3 text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{nombre}</dt>
      <dd className="mt-0.5 font-medium whitespace-pre-line">{children}</dd>
    </div>
  );
}
