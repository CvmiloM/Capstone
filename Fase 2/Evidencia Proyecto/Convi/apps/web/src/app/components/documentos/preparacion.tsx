"use client";

import { useActionState, useEffect, useState } from "react";
import { AvisoError, BotonEnviar } from "@/app/components/formulario";
import { cambiarDocumento } from "./acciones";
import type { Version } from "./datos";
import { PROCESAMIENTO, type Portal } from "./opciones";

type EstadoPreparacion = Pick<
  Version,
  | "estado_procesamiento"
  | "intentos_procesamiento"
  | "detalle_error_procesamiento"
> & { en_curso: boolean };

export function PreparacionDocumento({
  version,
  portal,
}: {
  version: Version;
  portal: Portal;
}) {
  const [estado, setEstado] = useState<EstadoPreparacion>({
    ...version,
    en_curso: false,
  });
  const [aviso, setAviso] = useState("");
  const [abierta, setAbierta] = useState(false);
  const [resultado, accion, pendiente] = useActionState(cambiarDocumento, {});

  useEffect(() => {
    if (
      !abierta ||
      !version.incluir_en_busqueda_ia ||
      version.estado_procesamiento === "LISTO"
    )
      return;
    let vigente = true;
    let temporizador: ReturnType<typeof setTimeout>;
    let peticion: AbortController | undefined;
    const inicio = Date.now();
    const consultar = async () => {
      if (!vigente) return;
      if (Date.now() - inicio > 10 * 60_000) {
        setAviso(
          "La preparación puede continuar en segundo plano, vuelve a abrir el documento para consultar su estado",
        );
        return;
      }
      if (document.hidden) {
        temporizador = setTimeout(consultar, 5000);
        return;
      }
      peticion = new AbortController();
      const plazo = setTimeout(() => peticion?.abort(), 12_000);
      try {
        const respuesta = await fetch(
          `/${portal}/documentos/versiones/${encodeURIComponent(version.id)}/preparacion`,
          { cache: "no-store", signal: peticion.signal },
        );
        if (!vigente) return;
        if (!respuesta.ok) {
          setAviso(
            "No pudimos consultar la preparación, recarga la página para comprobar tu acceso y el estado actual",
          );
          return;
        }
        const actual = (await respuesta.json()) as EstadoPreparacion;
        if (!vigente) return;
        setEstado(actual);
        setAviso("");
        if (
          actual.estado_procesamiento === "LISTO" ||
          actual.estado_procesamiento === "NO_APLICA" ||
          (actual.estado_procesamiento === "FALLIDO" && !actual.en_curso)
        )
          return;
      } catch {
        if (!vigente) return;
        setAviso(
          "No pudimos actualizar el estado, volveremos a consultarlo sin interrumpir la preparación",
        );
      } finally {
        clearTimeout(plazo);
      }
      if (vigente) temporizador = setTimeout(consultar, 3000);
    };
    temporizador = setTimeout(consultar, 3000);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
      peticion?.abort();
    };
  }, [
    abierta,
    resultado.solicitudPreparacion,
    portal,
    version.id,
    version.incluir_en_busqueda_ia,
    version.estado_procesamiento,
  ]);

  return (
    <details
      className="pointer-events-auto w-fit max-w-full text-sm"
      onToggle={(e) => setAbierta(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-muted-foreground">
        Preparación para búsqueda
      </summary>
      <div className="mt-2 space-y-3 text-muted-foreground">
        <p role="status">
          Estado: {PROCESAMIENTO[estado.estado_procesamiento]} · Intentos:{" "}
          {estado.intentos_procesamiento}
        </p>
        {estado.estado_procesamiento === "PENDIENTE" && (
          <p>El original está guardado, su preparación espera para comenzar</p>
        )}
        {estado.estado_procesamiento === "PROCESANDO" && (
          <p>
            Estamos preparando el texto para búsqueda, puedes seguir utilizando
            CONVI
          </p>
        )}
        {estado.estado_procesamiento === "LISTO" && (
          <p>
            El texto está preparado, solo se utilizará en búsquedas cuando esta
            versión esté publicada y vigente
          </p>
        )}
        {estado.estado_procesamiento === "NO_APLICA" && (
          <p>
            Este documento se conserva para consulta y descarga, no está
            habilitado como fuente de búsqueda con IA
          </p>
        )}
        {estado.detalle_error_procesamiento && (
          <p role="alert">{estado.detalle_error_procesamiento}</p>
        )}
        {estado.en_curso && estado.estado_procesamiento === "FALLIDO" && (
          <p>Hay un nuevo intento en espera</p>
        )}
        {aviso && <p role="status">{aviso}</p>}
        {version.incluir_en_busqueda_ia &&
          version.tipo_mime.includes("wordprocessingml") && (
            <p>
              En Word la paginación puede cambiar, los fragmentos conservan su
              texto sin asignar páginas que no se puedan comprobar
            </p>
          )}
        {version.incluir_en_busqueda_ia &&
          !["LISTO", "NO_APLICA"].includes(estado.estado_procesamiento) && (
            <form action={accion} className="space-y-2">
              <input type="hidden" name="accion" value="preparar" />
              <input type="hidden" name="version" value={version.id} />
              <input type="hidden" name="portal" value={portal} />
              {resultado.mensaje && (
                <AvisoError>{resultado.mensaje}</AvisoError>
              )}
              <BotonEnviar
                pendiente={pendiente || estado.en_curso}
                textoPendiente="En preparación…"
              >
                {estado.estado_procesamiento === "FALLIDO"
                  ? "Reintentar preparación"
                  : "Solicitar preparación"}
              </BotonEnviar>
            </form>
          )}
      </div>
    </details>
  );
}
