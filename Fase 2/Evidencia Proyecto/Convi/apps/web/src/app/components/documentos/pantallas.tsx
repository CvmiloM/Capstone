import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Encabezado,
  claseBotonPrimario,
  claseBotonSecundario,
  claseEnlace,
} from "@/app/components/formulario";
import {
  leer,
  type Documento,
  type Detalle,
  type VersionDetalle,
} from "./datos";
import { AccionesVersion, FormularioCarga } from "./formularios";
import { TarjetaDocumento } from "./tarjeta-documento";
import {
  COLOR_ESTADO,
  ESTADOS,
  PROCESAMIENTO,
  TIPOS,
  fecha,
  tamanoArchivo,
  type Portal,
} from "./opciones";

export async function ListaDocumentos({ portal }: { portal: Portal }) {
  const documentos = await leer<Documento[]>();
  if (!documentos) notFound();
  return (
    <>
      <Encabezado
        titulo="Documentos institucionales"
        descripcion="Conserva el reglamento y los documentos de tu escuela, con sus versiones y períodos de vigencia"
      />
      <Link href={`/${portal}/documentos/nuevo`} className={claseBotonPrimario}>
        Subir documento
      </Link>
      <div className="mt-6 space-y-3">
        {documentos.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-muted-foreground">
            Todavía no hay documentos, puedes comenzar con el reglamento interno
            de tu escuela
          </p>
        ) : (
          documentos.map((d) => (
            <Link
              key={d.id}
              href={`/${portal}/documentos/${d.id}`}
              className="block rounded-2xl border border-border bg-card p-5 shadow-tarjeta hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <p className="text-xs text-muted-foreground">
                {TIPOS[d.tipo_documento]}
              </p>
              <h2 className="mt-1 font-semibold">{d.titulo}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {d.versiones} {d.versiones === 1 ? "versión" : "versiones"} ·{" "}
                {d.vigente ? "Con versión vigente" : "Sin versión vigente"}
              </p>
            </Link>
          ))
        )}
      </div>
    </>
  );
}

export function NuevoDocumento({ portal }: { portal: Portal }) {
  return (
    <div className="max-w-2xl">
      <Link href={`/${portal}/documentos`} className={claseEnlace}>
        <span aria-hidden="true">← </span>Volver a documentos
      </Link>
      <div className="mt-5">
        <Encabezado
          titulo="Subir documento"
          descripcion="Primero guarda el documento y revísalo, después podrás publicarlo e indicar desde cuándo se utiliza"
        />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <FormularioCarga portal={portal} />
      </div>
    </div>
  );
}

export async function DetalleDocumento({
  portal,
  id,
  guardado,
}: {
  portal: Portal;
  id: string;
  guardado: boolean;
}) {
  const d = await leer<Detalle>(`/${encodeURIComponent(id)}`);
  if (!d) notFound();
  return (
    <>
      <Link href={`/${portal}/documentos`} className={claseEnlace}>
        <span aria-hidden="true">← </span>Volver a documentos
      </Link>
      <div className="mt-5">
        <Encabezado titulo={d.titulo} descripcion={TIPOS[d.tipo_documento]} />
        <dl className="mb-6 space-y-1 text-sm text-muted-foreground">
          <div>
            <dt className="inline font-medium text-destructive">Borrador: </dt>
            <dd className="inline">
              archivo guardado, pendiente de publicación
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-emerald-800 dark:text-emerald-300">
              Publicada:{" "}
            </dt>
            <dd className="inline">
              se utiliza durante las fechas de vigencia indicadas
            </dd>
          </div>
          <div>
            <dt className="inline font-medium">Archivada: </dt>
            <dd className="inline">
              se conserva para revisar antecedentes y decisiones anteriores
            </dd>
          </div>
        </dl>
      </div>
      {guardado && (
        <p
          role="status"
          className="mb-5 rounded-xl border border-primary/20 bg-accent p-3 text-sm"
        >
          Los cambios se guardaron correctamente
        </p>
      )}
      <details className="mb-6 max-w-2xl rounded-2xl border border-border bg-card p-5">
        <summary className="cursor-pointer font-medium">
          Subir una nueva versión
        </summary>
        <div className="mt-4">
          <FormularioCarga portal={portal} documentoId={id} />
        </div>
      </details>
      <h2 className="text-lg font-semibold">Versiones conservadas</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Cuando subes un archivo actualizado, el anterior también se guarda, así
        siempre puedes comprobar qué documento se utilizó al tomar una decisión
      </p>
      <p className="mt-2 mb-4 text-sm text-muted-foreground">
        Pulse en cualquiera de los recuadros para ver las opciones del documento
      </p>
      <div className="space-y-4">
        {d.versiones.map((v) => (
          <TarjetaDocumento
            key={v.id}
            nombre={d.titulo + " - " + v.etiqueta_version}
            preparacion={
              <details className="pointer-events-auto w-fit max-w-full text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Preparación para búsqueda
                </summary>
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <p>
                    Estado: {PROCESAMIENTO[v.estado_procesamiento]} · Intentos:{" "}
                    {v.intentos_procesamiento}
                  </p>
                  {v.incluir_en_busqueda_ia &&
                    v.estado_procesamiento === "PENDIENTE" && (
                      <p>
                        El original ya está disponible, la preparación
                        automática para búsqueda se incorporará en una próxima
                        entrega
                      </p>
                    )}
                  {d.tipo_documento === "PLANTILLA" && (
                    <p>
                      Las plantillas se pueden descargar, no se utilizan como
                      fuente para la búsqueda con IA
                    </p>
                  )}
                  {v.detalle_error_procesamiento && (
                    <p role="alert">{v.detalle_error_procesamiento}</p>
                  )}
                </div>
              </details>
            }
            acciones={
              <>
                <div className="flex flex-wrap items-start gap-2">
                  <Link
                    className={claseBotonSecundario}
                    href={`/${portal}/documentos/versiones/${v.id}`}
                  >
                    Abrir documento
                  </Link>
                  <a
                    className={claseBotonSecundario}
                    href={`/${portal}/documentos/versiones/${v.id}/archivo`}
                  >
                    Descargar original
                  </a>
                  {v.estado === "ARCHIVADO" && (
                    <AccionesVersion portal={portal} version={v} hoy={d.hoy} />
                  )}
                </div>
                {v.estado !== "ARCHIVADO" && (
                  <AccionesVersion portal={portal} version={v} hoy={d.hoy} />
                )}
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">
                {d.titulo} - {v.etiqueta_version}
              </h3>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${COLOR_ESTADO[v.estado]}`}
              >
                {ESTADOS[v.estado]}
              </span>
              {v.vigente && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground">
                  Vigente
                </span>
              )}
            </div>
            <p className="mt-2 break-all text-sm">
              {v.nombre_original} · {tamanoArchivo(v.tamano_bytes)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Registrada por {v.subido_por}
            </p>
            {v.vigente_desde && (
              <p className="mt-2 text-sm">
                Desde {fecha(v.vigente_desde)} ·{" "}
                {v.vigente_hasta
                  ? `Hasta ${fecha(v.vigente_hasta)}`
                  : "Sin fecha de término"}
              </p>
            )}
          </TarjetaDocumento>
        ))}
      </div>
    </>
  );
}

export async function VerVersion({
  portal,
  id,
  pagina,
}: {
  portal: Portal;
  id: string;
  pagina?: string;
}) {
  const v = await leer<VersionDetalle>(`/versiones/${encodeURIComponent(id)}`);
  if (!v) notFound();
  const numero =
    pagina && /^\d{1,6}$/.test(pagina) && Number(pagina) > 0
      ? Number(pagina)
      : 1;
  const archivo = `/${portal}/documentos/versiones/${encodeURIComponent(id)}/archivo`;
  return (
    <>
      <Link
        href={`/${portal}/documentos/${v.documento_id}`}
        className={claseEnlace}
      >
        <span aria-hidden="true">← </span>Volver al documento
      </Link>
      <div className="mt-5">
        <Encabezado
          titulo={v.titulo}
          descripcion={`Versión ${v.etiqueta_version} · ${ESTADOS[v.estado]}`}
        />
      </div>
      <div className="mb-5 flex flex-wrap gap-3">
        <a href={archivo} className={claseBotonPrimario}>
          Descargar original
        </a>
        {v.tipo_mime === "application/pdf" && (
          <a
            href={`${archivo}?ver=1#page=${numero}`}
            target="_blank"
            rel="noopener noreferrer"
            className={claseBotonSecundario}
          >
            Abrir PDF en otra pestaña
          </a>
        )}
      </div>
      {v.tipo_mime === "application/pdf" ? (
        <iframe
          title={`${v.titulo}, versión ${v.etiqueta_version}, página ${numero}`}
          src={`${archivo}?ver=1#page=${numero}`}
          className="h-[75vh] min-h-96 w-full rounded-2xl border border-border bg-muted"
        />
      ) : (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Este original es un documento Word, descárgalo para abrirlo con tu
          aplicación de documentos
        </p>
      )}
    </>
  );
}
