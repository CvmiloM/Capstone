import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { leer, type Detalle, type Documento } from "@/app/components/documentos/datos";
import { FormularioCarga } from "@/app/components/documentos/formularios";
import { ESTADOS } from "@/app/components/documentos/opciones";
import { PreparacionDocumento } from "@/app/components/documentos/preparacion";
import { claseEnlace } from "@/app/components/formulario";
import { BotonTerminarPaso } from "./boton-paso";

// PB-035 (HU-028): el reglamento se carga desde la guía con la misma carga de
// Documentos (PB-078), con el tipo ya fijo en RICE (CA1). La API lo deja en
// Borrador, habilitado para búsqueda y con su preparación pedida (CA2); aquí
// se ve su estado, intentos y error con el mismo componente de Documentos.
// Se publica con su vigencia en Documentos (CA4).
export async function PasoReglamento({
  version,
  listo,
  sinPreparacion,
}: {
  version: string;
  listo: boolean;
  /** CA3: la solicitud de preparación de la última carga no quedó confirmada. */
  sinPreparacion: boolean;
}) {
  const documentos = (await leer<Documento[]>("")) ?? [];
  const reglamentos = (
    await Promise.all(
      documentos
        .filter((d) => d.tipo_documento === "RICE")
        .map((d) => leer<Detalle>(`/${encodeURIComponent(d.id)}`)),
    )
  ).filter((d): d is Detalle => d !== null);
  const cargadas = reglamentos.reduce(
    (suma, d) => suma + d.versiones.filter((v) => v.estado !== "ARCHIVADO").length,
    0,
  );

  return (
    <div className="space-y-6">
      {sinPreparacion && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm"
        >
          El original se guardó, pero no pudimos confirmar la solicitud de
          preparación para búsqueda. Revisa su estado abajo y vuelve a
          solicitarla si hace falta.
        </p>
      )}

      {reglamentos.length === 0 ? (
        <section aria-labelledby="titulo-subir-rice">
          <h3 id="titulo-subir-rice" className="text-base font-semibold">
            Subir el reglamento
          </h3>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Un PDF o Word del reglamento interno de convivencia escolar. Queda
            en Borrador con su archivo original, y CONVI prepara su texto para
            las consultas con IA de Convivencia.
          </p>
          <FormularioCarga portal="admin" tipoFijo="RICE" volverAGuia />
        </section>
      ) : (
        reglamentos.map((documento) => (
          <section
            key={documento.id}
            aria-labelledby={`titulo-rice-${documento.id}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3
                id={`titulo-rice-${documento.id}`}
                className="text-base font-semibold"
              >
                {documento.titulo}
              </h3>
              <Link
                href={`/admin/documentos/${documento.id}`}
                className={`text-sm ${claseEnlace}`}
              >
                Publicar o archivar en Documentos
              </Link>
            </div>
            <ul className="mt-2 divide-y divide-border text-sm">
              {documento.versiones.map((v) => (
                <li key={v.id} className="space-y-1 py-2">
                  <p>
                    <span className="font-medium">{v.etiqueta_version}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {ESTADOS[v.estado] ?? v.estado}
                      {v.estado === "PUBLICADO" && !v.vigente
                        ? " fuera de vigencia"
                        : ""}
                    </span>
                  </p>
                  <PreparacionDocumento
                    key={`${v.id}-${v.estado_procesamiento}-${v.intentos_procesamiento}`}
                    version={v}
                    portal="admin"
                    habilitable={
                      documento.estado === "ACTIVO" &&
                      ["BORRADOR", "PUBLICADO"].includes(v.estado)
                    }
                  />
                </li>
              ))}
            </ul>
            <details className="mt-3 rounded-xl border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Subir otra versión
              </summary>
              <div className="mt-4">
                <FormularioCarga
                  portal="admin"
                  documentoId={documento.id}
                  volverAGuia
                />
              </div>
            </details>
          </section>
        ))
      )}

      <p
        role="note"
        className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
      >
        Solo una versión publicada y vigente se usa en las consultas con IA de
        Convivencia. Publícala con su fecha de inicio en Documentos cuando la
        hayas revisado.
      </p>

      <section className="border-t border-border pt-5">
        <p className="mb-3 text-sm text-muted-foreground">
          {cargadas === 0
            ? "Para marcar el paso como listo, sube el reglamento."
            : `Hay ${cargadas.toLocaleString("es-CL")} ${cargadas === 1 ? "versión cargada" : "versiones cargadas"} del reglamento.`}
        </p>
        {!listo && (
          <BotonTerminarPaso
            paso="reglamento"
            version={version}
            habilitado={cargadas > 0}
          />
        )}
      </section>
    </div>
  );
}
