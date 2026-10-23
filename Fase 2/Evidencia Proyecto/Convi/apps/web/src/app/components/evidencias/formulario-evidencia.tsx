"use client";

import { useActionState, useState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import { adjuntarEvidencia } from "./acciones";
import {
  ACEPTA,
  TAMANO_MAXIMO,
  TIPOS_EVIDENCIA,
  type DestinoEvidencia,
  type EstadoEvidencia,
} from "./opciones";

const estadoInicial: EstadoEvidencia = {};

// Mismos límites que valida la API (archivo-evidencia.ts).
const LARGO_MAXIMO_TITULO = 220;
const LARGO_MAXIMO_DESCRIPCION = 2000;

const claseControl =
  "mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15";

// PB-066 (HU-057 CA1): título, tipo y archivo obligatorios. El tamaño se
// revisa también aquí para no subir 25 MB en vano; el formato real lo
// revisa la API (PB-130).
export function FormularioEvidencia({
  destino,
  registroId,
}: {
  destino: DestinoEvidencia;
  registroId: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    adjuntarEvidencia,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  // Un archivo demasiado grande se avisa antes de enviar, junto a la
  // respuesta que se veía al elegirlo.
  const [pesado, setPesado] = useState<EstadoEvidencia | null>(null);
  const errores: Record<string, string> = {
    ...estado.errores,
    ...(pesado === estado ? { archivo: "El archivo pesa más de 25 MB." } : {}),
  };

  function borde(campo: string) {
    return errores[campo] ? "border-destructive" : "border-input";
  }
  function describir(campo: string, ayuda?: boolean) {
    return errores[campo]
      ? `${campo}-error`
      : ayuda
        ? `${campo}-ayuda`
        : undefined;
  }
  function mensajeError(campo: string) {
    return errores[campo] ? (
      <p id={`${campo}-error`} className="mt-1.5 text-sm text-destructive">
        {errores[campo]}
      </p>
    ) : null;
  }

  return (
    <form
      action={accion}
      noValidate
      className="space-y-4"
      onSubmit={(evento) => {
        const archivo = new FormData(evento.currentTarget).get("archivo");
        if (archivo instanceof File && archivo.size > TAMANO_MAXIMO) {
          evento.preventDefault();
          setPesado(estado);
        }
      }}
    >
      <input type="hidden" name="destino" value={destino} />
      <input type="hidden" name="registro_id" value={registroId} />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="titulo_evidencia" className="block text-sm font-medium">
            Título
          </label>
          <input
            id="titulo_evidencia"
            name="titulo"
            type="text"
            maxLength={LARGO_MAXIMO_TITULO}
            placeholder="Por ejemplo: captura del chat del curso"
            defaultValue={valores.titulo}
            aria-invalid={errores.titulo ? true : undefined}
            aria-describedby={describir("titulo")}
            className={`${claseControl} ${borde("titulo")}`}
          />
          {mensajeError("titulo")}
        </div>
        <div>
          <label htmlFor="tipo_evidencia" className="block text-sm font-medium">
            Tipo
          </label>
          <select
            id="tipo_evidencia"
            name="tipo"
            defaultValue={valores.tipo ?? ""}
            aria-invalid={errores.tipo ? true : undefined}
            aria-describedby={describir("tipo")}
            className={`${claseControl} ${borde("tipo")}`}
          >
            <option value="" disabled>
              Elige un tipo
            </option>
            {TIPOS_EVIDENCIA.map((tipo) => (
              <option key={tipo.valor} value={tipo.valor}>
                {tipo.texto}
              </option>
            ))}
          </select>
          {mensajeError("tipo")}
        </div>
      </div>

      <div>
        <label htmlFor="archivo_evidencia" className="block text-sm font-medium">
          Archivo
        </label>
        <input
          id="archivo_evidencia"
          name="archivo"
          type="file"
          accept={ACEPTA}
          aria-invalid={errores.archivo ? true : undefined}
          aria-describedby={describir("archivo", true)}
          className={`${claseControl} ${borde("archivo")} file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm`}
        />
        {errores.archivo ? (
          mensajeError("archivo")
        ) : (
          <p id="archivo-ayuda" className="mt-1.5 text-sm text-muted-foreground">
            PDF, Word (DOCX), imagen JPG, PNG o WEBP, o correo exportado (EML),
            de hasta 25 MB.
            {estado.errores && " Vuelve a elegir el archivo."}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="descripcion_evidencia"
          className="block text-sm font-medium"
        >
          Descripción (opcional)
        </label>
        <textarea
          id="descripcion_evidencia"
          name="descripcion"
          rows={2}
          maxLength={LARGO_MAXIMO_DESCRIPCION}
          defaultValue={valores.descripcion}
          aria-invalid={errores.descripcion ? true : undefined}
          aria-describedby={describir("descripcion")}
          className={`${claseControl} ${borde("descripcion")}`}
        />
        {mensajeError("descripcion")}
      </div>

      <p className="text-sm text-muted-foreground">
        Queda guardada en forma privada con tu nombre y la fecha. Una evidencia
        no se edita ni se borra.
      </p>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Adjuntando…" : "Adjuntar evidencia"}
      </button>
    </form>
  );
}
