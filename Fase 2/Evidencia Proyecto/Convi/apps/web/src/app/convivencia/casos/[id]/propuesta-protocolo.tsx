"use client";

import { EtiquetaAccion } from "./etiqueta-accion";
import { useActionState, useEffect, useState } from "react";
import { FormularioConCarga } from "@/app/components/actividad";
import { AvisoError, BotonEnviar } from "@/app/components/formulario";
import {
  MascotaIA,
  type FaseMascota,
  type MensajesMascota,
} from "@/app/components/normativa/mascota-ia";
import type { EstadoAccion } from "./acciones";
import { pedirPropuestaProtocolo } from "./acciones-propuesta";

// PB-124 (HU-105): si el caso no tiene un protocolo oficial, la IA propone
// pasos citados del reglamento. La propuesta queda como protocolo no oficial en
// borrador y nunca se vuelve oficial.
const estadoInicial: EstadoAccion = {};
const FASES_ESPERA: FaseMascota[] = ["buscando", "pensando", "escribiendo"];
const MENSAJES: MensajesMascota = {
  reposo:
    "Si ningún protocolo oficial calza con este caso, puedo proponer pasos a partir del reglamento",
  buscando: "Buscando en el reglamento de tu escuela…",
  pensando: "Ordenando los pasos y sus fuentes…",
  escribiendo: "Redactando la propuesta…",
  "sin-disposicion": "El reglamento no tiene disposiciones para este caso",
  error: "No pude preparar la propuesta, revisa el mensaje de abajo",
};

export function PropuestaProtocolo({ casoId }: { casoId: string }) {
  const [estado, accion, pendiente] = useActionState(
    pedirPropuestaProtocolo.bind(null, casoId),
    estadoInicial,
  );
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    if (!pendiente) return;
    const pensar = setTimeout(() => setPaso(1), 2500);
    const escribir = setTimeout(() => setPaso(2), 6000);
    return () => {
      clearTimeout(pensar);
      clearTimeout(escribir);
    };
  }, [pendiente]);

  const sinFuentes = estado.mensaje?.startsWith("El reglamento publicado");
  const fase: FaseMascota = pendiente
    ? FASES_ESPERA[paso]
    : sinFuentes
      ? "sin-disposicion"
      : estado.mensaje
        ? "error"
        : "reposo";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="shrink-0">
        <MascotaIA fase={fase} mensajes={MENSAJES} />
      </div>
      <FormularioConCarga
        action={accion}
        onSubmit={() => setPaso(0)}
        className="flex-1 space-y-3"
      >
        <p className="text-sm text-muted-foreground">
          La IA busca en el reglamento publicado y propone pasos con sus
          fuentes, que quedan como protocolo{" "}
          <span className="font-medium text-foreground">
            Propuesta IA, no oficial
          </span>{" "}
          en borrador: lo revisas en Protocolos y, para usarlo, se publica con
          revisor y documento de origen, igual que uno oficial
        </p>
        {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
        <div className="sm:w-72">
          <BotonEnviar pendiente={pendiente} textoPendiente="Preparando la propuesta…">
            <EtiquetaAccion icono="documentos">Proponer un protocolo con IA</EtiquetaAccion>
          </BotonEnviar>
        </div>
      </FormularioConCarga>
    </div>
  );
}
