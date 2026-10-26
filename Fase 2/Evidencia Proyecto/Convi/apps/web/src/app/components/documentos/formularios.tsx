"use client";
import { useActionState, useId, useRef, useState } from "react";
import {
  AvisoError,
  BotonEnviar,
  Campo,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { cambiarDocumento } from "./acciones";
import { TIPOS, fecha, tamanoArchivo, type Portal } from "./opciones";
import type { Version } from "./datos";

export function FormularioCarga({
  portal,
  documentoId,
}: {
  portal: Portal;
  documentoId?: string;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [tipo, setTipo] = useState("RICE");
  const entrada = useRef<HTMLInputElement>(null);
  const archivoId = useId();
  const [estado, accion, pendiente] = useActionState(cambiarDocumento, {});
  return (
    <form
      action={accion}
      onReset={() => setArchivo(null)}
      className="space-y-4"
    >
      <input type="hidden" name="accion" value="cargar" />
      <input type="hidden" name="portal" value={portal} />
      <input type="hidden" name="id" value={documentoId ?? ""} />
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      {!documentoId && (
        <>
          <Campo
            name="titulo"
            etiqueta="Título del documento"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            maxLength={220}
            error={estado.errores?.titulo}
            placeholder="Reglamento interno de convivencia escolar"
          />
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              Tipo de documento
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(TIPOS).map(([valor, nombre]) => (
                <label
                  key={valor}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-input px-3 py-2.5 text-sm has-checked:border-primary has-checked:bg-accent"
                >
                  <input
                    type="radio"
                    name="tipo_documento"
                    value={valor}
                    checked={tipo === valor}
                    onChange={() => setTipo(valor)}
                    required
                    className="accent-primary"
                  />
                  {nombre}
                </label>
              ))}
            </div>
            {estado.errores?.tipo_documento && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {estado.errores.tipo_documento}
              </p>
            )}
          </fieldset>
        </>
      )}
      <Campo
        name="etiqueta_version"
        etiqueta="Etiqueta de esta versión"
        value={etiqueta}
        onChange={(e) => setEtiqueta(e.target.value)}
        required
        maxLength={60}
        error={estado.errores?.etiqueta_version}
        ayuda="Ejemplo de etiqueta: 2026, Corregida, Actualizada, versión 2"
      />
      <div>
        <label htmlFor={archivoId} className="mb-1.5 block text-sm font-medium">
          Documento a subir
        </label>
        <div
          className={
            "flex items-center gap-3 rounded-xl border bg-card px-3 py-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/15 " +
            (estado.errores?.archivo ? "border-destructive" : "border-input")
          }
        >
          <input
            ref={entrada}
            id={archivoId}
            name="archivo"
            type="file"
            accept=".pdf,.docx"
            required={!archivo}
            disabled={pendiente}
            className="sr-only"
            aria-invalid={!!estado.errores?.archivo}
            aria-describedby={archivoId + "-ayuda"}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          <label
            htmlFor={archivoId}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm"
          >
            {!archivo && (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-5 w-5 shrink-0 text-primary"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9"
                />
                <path strokeLinecap="round" d="m6 15 9-9" />
              </svg>
            )}
            <span className="break-all font-semibold">
              {archivo ? archivo.name : "Seleccionar archivo"}
            </span>
          </label>
          {archivo && (
            <button
              type="button"
              disabled={pendiente}
              aria-label="Quitar documento seleccionado"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-2xl text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => {
                setArchivo(null);
                if (entrada.current) entrada.current.value = "";
              }}
            >
              ×
            </button>
          )}
        </div>
        <p
          id={archivoId + "-ayuda"}
          className={
            "mt-1.5 text-sm " +
            (estado.errores?.archivo
              ? "text-destructive"
              : "text-muted-foreground")
          }
        >
          {estado.errores?.archivo ??
            "PDF o Word DOCX de hasta 25 MB" +
              (archivo ? " · " + tamanoArchivo(archivo.size) : "")}
        </p>
      </div>
      <BotonEnviar pendiente={pendiente} textoPendiente="Guardando documento…">
        {documentoId ? "Guardar nueva versión" : "Guardar documento"}
      </BotonEnviar>
    </form>
  );
}

function FormularioEstado({
  portal,
  version,
  accion: tipo,
  hoy,
}: {
  portal: Portal;
  version: Version;
  accion: "publicar" | "cerrar" | "archivar" | "republicar";
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(cambiarDocumento, {});
  return (
    <form action={accion} className="mt-4 space-y-3">
      <input type="hidden" name="accion" value={tipo} />
      <input type="hidden" name="portal" value={portal} />
      <input type="hidden" name="version" value={version.id} />
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      {tipo === "republicar" && (
        <div
          className="rounded-xl border border-primary/20 bg-accent p-4 text-sm"
          role="note"
        >
          <h4 className="font-semibold">
            ¿Quieres publicar nuevamente este documento?
          </h4>
          <p className="mt-2">
            Se usará este mismo archivo desde el {fecha(hoy)}, las otras
            publicaciones de este documento quedarán archivadas y las
            referencias anteriores se conservarán
          </p>
          <p className="mt-2 text-muted-foreground">
            Se registrará una nueva publicación, la anterior conservará sus
            fechas
          </p>
        </div>
      )}
      {tipo === "publicar" && (
        <Campo
          name="vigente_desde"
          id={version.id + "-" + tipo + "-desde"}
          etiqueta="Vigente desde"
          type="date"
          required
          error={estado.errores?.vigente_desde}
        />
      )}
      {tipo === "republicar" && (
        <input type="hidden" name="vigente_desde" value={hoy} />
      )}
      {tipo !== "archivar" && (
        <Campo
          name="vigente_hasta"
          id={version.id + "-" + tipo + "-hasta"}
          etiqueta={
            tipo === "cerrar"
              ? "Último día de vigencia"
              : "Vigente hasta, opcional"
          }
          type="date"
          required={tipo === "cerrar"}
          min={
            tipo === "cerrar"
              ? (version.vigente_desde ?? undefined)
              : tipo === "republicar"
                ? hoy
                : undefined
          }
          error={estado.errores?.vigente_hasta}
          ayuda={
            tipo === "publicar" || tipo === "republicar"
              ? "Si lo dejas vacío, la vigencia será indefinida"
              : undefined
          }
        />
      )}
      {tipo === "publicar" && (
        <p className="text-sm text-muted-foreground">
          Al confirmar, este documento podrá utilizarse durante las fechas que
          indiques
        </p>
      )}
      {tipo === "archivar" && (
        <p className="text-sm text-muted-foreground">
          El documento dejará de usarse en nuevas consultas, podrás seguir
          abriéndolo y descargándolo
        </p>
      )}
      <BotonEnviar pendiente={pendiente} textoPendiente="Guardando…">
        {tipo === "publicar"
          ? "Confirmar publicación"
          : tipo === "republicar"
            ? "Sí, publicar nuevamente"
            : tipo === "cerrar"
              ? "Guardar término de vigencia"
              : "Confirmar archivo del documento"}
      </BotonEnviar>
    </form>
  );
}

export function AccionesVersion({
  portal,
  version,
  hoy,
}: {
  portal: Portal;
  version: Version;
  hoy: string;
}) {
  const acciones =
    version.estado === "ARCHIVADO"
      ? (["republicar"] as const)
      : version.estado === "BORRADOR"
        ? (["publicar"] as const)
        : version.vigente_hasta
          ? (["archivar"] as const)
          : (["cerrar", "archivar"] as const);
  return (
    <div
      className={
        version.estado === "ARCHIVADO"
          ? "contents"
          : "mt-4 flex flex-wrap items-start gap-3"
      }
    >
      {acciones.map((tipo) => (
        <details
          key={tipo}
          open={tipo === "publicar"}
          className="w-full sm:w-auto sm:max-w-sm"
        >
          <summary
            className={
              "cursor-pointer list-none [&::-webkit-details-marker]:hidden " +
              (tipo === "publicar" || tipo === "republicar"
                ? claseBotonPrimario
                : claseBotonSecundario)
            }
          >
            {tipo === "publicar"
              ? "Publicar documento"
              : tipo === "republicar"
                ? "Publicar nuevamente"
                : tipo === "cerrar"
                  ? "Cerrar vigencia"
                  : "Archivar documento"}
          </summary>
          <FormularioEstado
            portal={portal}
            version={version}
            accion={tipo}
            hoy={hoy}
          />
        </details>
      ))}
    </div>
  );
}
