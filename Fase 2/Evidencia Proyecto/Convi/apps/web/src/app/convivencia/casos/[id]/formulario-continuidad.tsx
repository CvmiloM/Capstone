"use client";

import { useActionState, useId, useState } from "react";
import { AvisoError, BotonEnviar } from "@/app/components/formulario";
import { SelectorFiltro } from "@/app/components/selector-filtro";
import { Campo, propsControl } from "./formularios";
import { guardarContinuidadCaso, type EstadoAccion } from "./acciones";

const inicial: EstadoAccion = {};

export function FormularioContinuidad({
  casoId,
  modo,
  ultimoMovimientoId,
  version,
  opciones = [],
}: {
  casoId: string;
  modo: "reapertura" | "responsable";
  ultimoMovimientoId?: string | null;
  version?: string;
  opciones?: { id: string; nombre: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(
    guardarContinuidadCaso,
    inicial,
  );
  const [responsable, elegirResponsable] = useState("");
  const motivoId = useId();
  const reasignar = modo === "responsable";
  if (reasignar && opciones.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No hay otra cuenta activa de Convivencia disponible, pide al
        administrador que incorpore a la persona que recibirá el caso
      </p>
    );
  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="modo_continuidad" value={modo} />
      <input
        type="hidden"
        name="movimiento_anterior_id"
        value={ultimoMovimientoId ?? ""}
      />
      <input type="hidden" name="version_responsable" value={version ?? ""} />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}
      {reasignar && (
        <div>
          <SelectorFiltro
            nombre="responsable_id"
            etiqueta="Nueva persona responsable"
            valor={responsable}
            cambiar={elegirResponsable}
            opciones={[
              ["", "Elige una persona de Convivencia"],
              ...opciones.map((p): [string, string] => [p.id, p.nombre]),
            ]}
          />
          {estado.errores?.responsable_id && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {estado.errores.responsable_id}
            </p>
          )}
        </div>
      )}
      <Campo
        id={motivoId}
        etiqueta={
          reasignar ? "Motivo de la reasignación" : "Motivo de la reapertura"
        }
        error={estado.errores?.motivo}
        ayuda={
          reasignar
            ? "Queda registrado quién entregó el caso, quién lo recibió y por qué"
            : "El caso continuará con el mismo código, sus antecedentes y el cierre anterior"
        }
      >
        <textarea
          {...propsControl(
            motivoId,
            estado.errores?.motivo,
            true,
            "motivo_continuidad",
          )}
          rows={3}
          maxLength={500}
          defaultValue={estado.valores?.motivo}
          placeholder={
            reasignar
              ? "Por ejemplo: cambio en el equipo que realizará el acompañamiento"
              : "Por ejemplo: surgieron nuevos antecedentes y se necesita retomar el acompañamiento"
          }
        />
      </Campo>
      <BotonEnviar
        pendiente={pendiente}
        textoPendiente={reasignar ? "Reasignando…" : "Reabriendo…"}
      >
        {reasignar ? "Confirmar reasignación" : "Reabrir caso"}
      </BotonEnviar>
    </form>
  );
}
