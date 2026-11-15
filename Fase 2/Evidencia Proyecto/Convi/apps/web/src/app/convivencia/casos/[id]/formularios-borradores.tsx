"use client";

import { EtiquetaAccion } from "./etiqueta-accion";
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

// PB-125 y PB-126 (HU-106 y HU-107): pedir, corregir y revisar borradores con
// IA. Decisión del PO (2026-11-15): solo se pide el informe del caso, los
// borradores de acta que ya existen se siguen revisando y corrigiendo.
const estadoInicial: EstadoAccion = {};
const FASES_ESPERA: FaseMascota[] = ["buscando", "pensando", "escribiendo"];
const MENSAJES: MensajesMascota = {
  reposo:
    "Puedo redactar un borrador de informe con lo que está registrado en el caso",
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

export function FormularioBorradorIA({ casoId }: { casoId: string }) {
  const [estado, accion, pendiente] = useActionState(
    pedirBorrador,
    estadoInicial,
  );
  const [paso, setPaso] = useState(0);
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
        <input type="hidden" name="tipo" value="INFORME" />
        {estado.mensaje && !estado.errores && (
          <AvisoError>{estado.mensaje}</AvisoError>
        )}
        {(errores.tipo || errores.actuacion_id) && (
          <AvisoError>{errores.tipo ?? errores.actuacion_id}</AvisoError>
        )}
        <div className="rounded-xl border border-primary bg-accent px-4 py-3 text-sm">
          <p className="font-medium">Informe del caso</p>
          <p className="text-xs text-muted-foreground">
            Antecedentes, actuaciones y cifras del caso
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          La IA recibe el expediente con seudónimos, sin nombres, RUT ni datos de
          contacto, y CONVI pone después los nombres reales: el borrador queda
          marcado como generado con IA y pendiente de revisión, nunca como
          informe publicado.
        </p>
        <button
          type="submit"
          disabled={pendiente}
          className={claseBotonPrimario}
        >
          <EtiquetaAccion icono="documentos">
            {pendiente ? "Redactando…" : "Preparar borrador con IA"}
          </EtiquetaAccion>
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
        <EtiquetaAccion icono="guardar">
          {pendiente ? "Guardando…" : "Guardar como nueva edición"}
        </EtiquetaAccion>
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
          <EtiquetaAccion icono="confirmar">
            Marcar como revisado
          </EtiquetaAccion>
        </button>
        <button
          type="submit"
          name="estado_nuevo"
          value="DESCARTADO"
          disabled={pendiente}
          className={claseBotonSecundario}
        >
          <EtiquetaAccion icono="cerrar">
            Descartar
          </EtiquetaAccion>
        </button>
      </div>
    </FormularioConCarga>
  );
}
