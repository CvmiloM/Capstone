"use client";

import { useActionState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import type { PasoProtocolo } from "../datos";
import type { EstadoAccion } from "./acciones";
import {
  asignarPaso,
  avanzarPaso,
  cambiarEstadoProtocolo,
} from "./acciones-protocolo";
import { Campo, propsControl } from "./formularios";
import {
  LARGO_MAXIMO_MOTIVO_PROTOCOLO,
  LARGO_MAXIMO_NOTAS_PASO,
  NOMBRE_ESTADO_PASO,
  NOMBRE_ESTADO_PROTOCOLO,
} from "./opciones";

// PB-055 (HU-048) y PB-056 (HU-049): formularios de los pasos del protocolo
// aplicado y de su término. Varios conviven en la página, así que cada control
// lleva un id propio y el nombre del campo que espera la API.
const estadoInicial: EstadoAccion = {};

function ErrorGeneral({ estado }: { estado: EstadoAccion }) {
  return estado.mensaje && !estado.errores ? (
    <AvisoError>{estado.mensaje}</AvisoError>
  ) : null;
}

// CA1, CA3 y CA4: el paso pasa a En progreso, se completa o se omite con una
// justificación. Vencido no se elige: lo da el plazo.
export function FormularioAvancePaso({
  casoId,
  paso,
}: {
  casoId: string;
  paso: PasoProtocolo;
}) {
  const [estado, accion, pendiente] = useActionState(
    avanzarPaso,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const opciones = ["EN_PROGRESO", "COMPLETADO", "OMITIDO"].filter(
    (valor) => valor !== paso.estado,
  );
  const sufijo = paso.id.slice(0, 8);

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="paso_id" value={paso.id} />
      <input type="hidden" name="version" value={paso.version} />
      <ErrorGeneral estado={estado} />

      <Campo
        id={`paso_estado_${sufijo}`}
        etiqueta="Nuevo estado del paso"
        error={errores.estado_nuevo}
        ayuda={
          paso.requiere_evidencia && paso.respaldos.length === 0
            ? "Este paso exige evidencia: adjunta el archivo al paso antes de completarlo."
            : undefined
        }
      >
        <select
          {...propsControl(
            `paso_estado_${sufijo}`,
            errores.estado_nuevo,
            paso.requiere_evidencia && paso.respaldos.length === 0,
            "estado_nuevo",
          )}
          defaultValue={valores.estado_nuevo ?? ""}
        >
          <option value="" disabled>
            Elige un estado
          </option>
          {opciones.map((valor) => (
            <option key={valor} value={valor}>
              {NOMBRE_ESTADO_PASO[valor]}
            </option>
          ))}
        </select>
      </Campo>

      <Campo
        id={`paso_notas_${sufijo}`}
        etiqueta="Notas"
        error={errores.notas}
        ayuda="Obligatorias para omitir el paso: explica por qué. Al avanzar o completar, puedes contar qué se hizo."
      >
        <textarea
          {...propsControl(`paso_notas_${sufijo}`, errores.notas, true, "notas")}
          rows={3}
          maxLength={LARGO_MAXIMO_NOTAS_PASO}
          defaultValue={valores.notas}
        />
      </Campo>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Registrar avance"}
      </button>
    </form>
  );
}

// CA1 y CA2: el responsable es una cuenta activa de Convivencia, aunque la
// acción la realice otra persona según la descripción del paso.
export function FormularioAsignacionPaso({
  casoId,
  paso,
  responsables,
  hoy,
}: {
  casoId: string;
  paso: PasoProtocolo;
  responsables: { id: string; nombre: string }[];
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    asignarPaso,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const sufijo = paso.id.slice(0, 8);

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="paso_id" value={paso.id} />
      <input type="hidden" name="version" value={paso.version} />
      <ErrorGeneral estado={estado} />

      <Campo
        id={`paso_responsable_${sufijo}`}
        etiqueta="Responsable"
        error={errores.responsable_id}
      >
        <select
          {...propsControl(
            `paso_responsable_${sufijo}`,
            errores.responsable_id,
            false,
            "responsable_id",
          )}
          defaultValue={valores.responsable_id ?? paso.responsable_id ?? ""}
        >
          <option value="" disabled>
            Elige a una persona de Convivencia
          </option>
          {responsables.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.nombre}
            </option>
          ))}
        </select>
      </Campo>

      <Campo
        id={`paso_vence_${sufijo}`}
        etiqueta="Fecha de vencimiento"
        error={errores.vence_dia}
        ayuda="Un plazo nuevo no puede ser anterior a hoy."
      >
        <input
          {...propsControl(`paso_vence_${sufijo}`, errores.vence_dia, true, "vence_dia")}
          type="date"
          min={hoy}
          defaultValue={valores.vence_dia ?? paso.vence_dia ?? ""}
        />
      </Campo>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Guardar responsable y plazo"}
      </button>
    </form>
  );
}

// HU-049 CA1 y CA2: un protocolo Activo se completa o cancela, aunque queden
// pasos pendientes, y uno terminado se reabre; siempre con un motivo.
export function FormularioEstadoProtocolo({
  casoId,
  protocoloId,
  version,
  estadoActual,
}: {
  casoId: string;
  protocoloId: string;
  version: string;
  estadoActual: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    cambiarEstadoProtocolo,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const opciones =
    estadoActual === "ACTIVO"
      ? [
          { valor: "COMPLETADO", texto: NOMBRE_ESTADO_PROTOCOLO.COMPLETADO },
          { valor: "CANCELADO", texto: NOMBRE_ESTADO_PROTOCOLO.CANCELADO },
        ]
      : [{ valor: "ACTIVO", texto: "Reabrir (Activo)" }];
  const sufijo = protocoloId.slice(0, 8);

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="protocolo_id" value={protocoloId} />
      <input type="hidden" name="version" value={version} />
      <ErrorGeneral estado={estado} />

      <Campo
        id={`protocolo_estado_${sufijo}`}
        etiqueta="Nuevo estado del protocolo"
        error={errores.estado_nuevo}
      >
        <select
          {...propsControl(
            `protocolo_estado_${sufijo}`,
            errores.estado_nuevo,
            false,
            "estado_nuevo",
          )}
          defaultValue={valores.estado_nuevo ?? ""}
        >
          <option value="" disabled>
            Elige un estado
          </option>
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
      </Campo>

      <Campo
        id={`protocolo_motivo_${sufijo}`}
        etiqueta="Motivo"
        error={errores.motivo}
        ayuda={
          estadoActual === "ACTIVO"
            ? "Queda en la auditoría con tu nombre y la fecha de término. Completar el protocolo no cierra el caso."
            : "Queda en la auditoría con tu nombre y la fecha."
        }
      >
        <textarea
          {...propsControl(`protocolo_motivo_${sufijo}`, errores.motivo, true, "motivo")}
          rows={2}
          maxLength={LARGO_MAXIMO_MOTIVO_PROTOCOLO}
          defaultValue={valores.motivo}
        />
      </Campo>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Cambiar estado del protocolo"}
      </button>
    </form>
  );
}
