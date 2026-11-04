"use client";

import { useActionState, useEffect, useState } from "react";
import { FormularioConCarga } from "@/app/components/actividad";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import {
  MascotaIA,
  type FaseMascota,
  type MensajesMascota,
} from "@/app/components/normativa/mascota-ia";
import type { EstadoAccion } from "./acciones";
import {
  editarBorrador,
  pedirBorrador,
  revisarBorrador,
} from "./acciones-borradores";
import { Campo, propsControl } from "./formularios";

// PB-125 y PB-126 (HU-106 y HU-107): pedir, corregir y revisar borradores de
// acta y de informe de caso con IA.
const estadoInicial: EstadoAccion = {};
const FASES_ESPERA: FaseMascota[] = ["buscando", "pensando", "escribiendo"];
const MENSAJES: MensajesMascota = {
  reposo:
    "Puedo redactar un borrador de acta o de informe con lo que está registrado en el caso",
  buscando: "Leyendo el expediente con seudónimos…",
  pensando: "Ordenando los antecedentes…",
  escribiendo: "Redactando el borrador…",
  error: "No pude preparar el borrador, revisa el mensaje de abajo",
};

export type ActuacionElegible = {
  id: string;
  tipo: string;
  estado: string;
  fecha: string | null;
  objetivo: string;
};

const NOMBRE_TIPO: Record<string, string> = {
  INTERVENCION: "Intervención",
  ENTREVISTA: "Entrevista",
  REUNION: "Reunión",
  MEDIACION: "Mediación",
  SEGUIMIENTO: "Seguimiento",
  ACOMPANAMIENTO: "Acompañamiento",
};

export function FormularioBorradorIA({
  casoId,
  actuaciones,
  fechas,
}: {
  casoId: string;
  actuaciones: ActuacionElegible[];
  fechas: Record<string, string>;
}) {
  const [estado, accion, pendiente] = useActionState(
    pedirBorrador,
    estadoInicial,
  );
  const [paso, setPaso] = useState(0);
  const [tipo, setTipo] = useState(estado.valores?.tipo ?? "ACTA");
  const errores = estado.errores ?? {};

  useEffect(() => {
    if (!pendiente) return;
    const pensar = setTimeout(() => setPaso(1), 1500);
    const escribir = setTimeout(() => setPaso(2), 4000);
    return () => {
      clearTimeout(pensar);
      clearTimeout(escribir);
    };
  }, [pendiente]);

  const fase: FaseMascota = pendiente
    ? FASES_ESPERA[paso]
    : estado.mensaje && !estado.errores
      ? "error"
      : "reposo";

  return (
    <div className="space-y-4">
      <MascotaIA fase={fase} mensajes={MENSAJES} />
      <FormularioConCarga
        action={accion}
        onSubmit={() => setPaso(0)}
        noValidate
        className="space-y-4"
      >
        <input type="hidden" name="caso_id" value={casoId} />
        {estado.mensaje && !estado.errores && (
          <AvisoError>{estado.mensaje}</AvisoError>
        )}
        <fieldset disabled={pendiente} className="space-y-4">
          <div role="radiogroup" aria-label="Tipo de borrador" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["ACTA", "Acta", "De una entrevista, reunión u otra actuación, o del caso"],
                ["INFORME", "Informe del caso", "Antecedentes, actuaciones y cifras del caso"],
              ] as const
            ).map(([valor, titulo, detalle]) => (
              <label
                key={valor}
                className={`flex min-h-11 cursor-pointer flex-col rounded-xl border px-4 py-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${
                  tipo === valor
                    ? "border-primary bg-accent"
                    : "border-border hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  value={valor}
                  checked={tipo === valor}
                  onChange={() => setTipo(valor)}
                  className="sr-only"
                />
                <span className="font-medium">{titulo}</span>
                <span className="text-xs text-muted-foreground">{detalle}</span>
              </label>
            ))}
          </div>
          {errores.tipo && (
            <p className="text-sm text-destructive">{errores.tipo}</p>
          )}
          {tipo === "ACTA" && (
            <Campo
              id="borrador_actuacion"
              etiqueta="¿De qué actuación es el acta? (opcional)"
              error={errores.actuacion_id}
              ayuda="Si no eliges una, el acta resume el caso completo"
            >
              <select
                {...propsControl(
                  "borrador_actuacion",
                  errores.actuacion_id,
                  true,
                  "actuacion_id",
                )}
                defaultValue={estado.valores?.actuacion_id ?? ""}
              >
                <option value="">Del caso completo</option>
                {actuaciones.map((a) => (
                  <option key={a.id} value={a.id}>
                    {NOMBRE_TIPO[a.tipo] ?? a.tipo}
                    {a.fecha ? ` del ${fechas[a.id]}` : ""}: {a.objetivo}
                  </option>
                ))}
              </select>
            </Campo>
          )}
        </fieldset>
        <p className="text-sm text-muted-foreground">
          La IA recibe el expediente con seudónimos, sin nombres, RUT ni datos de
          contacto, y CONVI pone después los nombres reales: el borrador queda
          marcado como generado con IA y pendiente de revisión, nunca como acta
          firmada ni informe publicado.
        </p>
        <button
          type="submit"
          disabled={pendiente}
          className={claseBotonPrimario}
        >
          {pendiente ? "Redactando…" : "Preparar borrador con IA"}
        </button>
      </FormularioConCarga>
    </div>
  );
}

export function FormularioEdicionBorrador({
  casoId,
  borrador,
}: {
  casoId: string;
  borrador: { id: string; titulo: string; contenido: string; version: string };
}) {
  const [estado, accion, pendiente] = useActionState(
    editarBorrador,
    estadoInicial,
  );
  const errores = estado.errores ?? {};
  const id = (campo: string) => `borrador_${borrador.id}_${campo}`;
  return (
    <FormularioConCarga action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="borrador_id" value={borrador.id} />
      <input type="hidden" name="version" value={borrador.version} />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}
      <Campo id={id("titulo")} etiqueta="Título" error={errores.titulo}>
        <input
          {...propsControl(id("titulo"), errores.titulo, false, "titulo")}
          maxLength={220}
          defaultValue={estado.valores?.titulo ?? borrador.titulo}
        />
      </Campo>
      <Campo
        id={id("contenido")}
        etiqueta="Contenido"
        error={errores.contenido}
        ayuda="Guardar crea una nueva edición: el texto que redactó la IA se conserva tal cual"
      >
        <textarea
          {...propsControl(id("contenido"), errores.contenido, true, "contenido")}
          rows={14}
          maxLength={8000}
          defaultValue={estado.valores?.contenido ?? borrador.contenido}
        />
      </Campo>
      <button
        type="submit"
        disabled={pendiente}
        className={claseBotonPrimario}
      >
        {pendiente ? "Guardando…" : "Guardar como nueva edición"}
      </button>
    </FormularioConCarga>
  );
}

export function BotonesRevisionBorrador({
  casoId,
  borradorId,
  version,
}: {
  casoId: string;
  borradorId: string;
  version: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    revisarBorrador,
    estadoInicial,
  );
  return (
    <FormularioConCarga
      action={accion}
      onSubmit={(evento) => {
        const boton = (evento.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        if (
          boton?.value === "DESCARTADO" &&
          !window.confirm("¿Descartar este borrador? Queda en el caso marcado como descartado.")
        )
          evento.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="borrador_id" value={borradorId} />
      <input type="hidden" name="version" value={version} />
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="estado_nuevo"
          value="REVISADO"
          disabled={pendiente}
          className={claseBotonPrimario}
        >
          Marcar como revisado
        </button>
        <button
          type="submit"
          name="estado_nuevo"
          value="DESCARTADO"
          disabled={pendiente}
          className={claseBotonSecundario}
        >
          Descartar
        </button>
      </div>
    </FormularioConCarga>
  );
}
