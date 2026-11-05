"use client";

import { FormularioConCarga } from "@/app/components/actividad";

import { useActionState, useState } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import type { EstadoAccion } from "./acciones";
import { copiarCorreo, enviarCorreo } from "./acciones-correos";

const estadoInicial: EstadoAccion = {};

// PB-087 (HU-076): un profesional de Convivencia confirma y se envía. La clave
// del envío llega de la página: repetir el mismo envío no manda otro correo
// (CA3). CA5: si el apoderado no puede ser contactado, hay que marcar la
// advertencia para enviar igual, y la base la deja en la auditoría.
export function BotonEnviarCorreo({
  casoId,
  correoId,
  claveEnvio,
  advertencia,
  completo,
}: {
  casoId: string;
  correoId: string;
  claveEnvio: string;
  /** El vínculo indica que el apoderado no puede ser contactado. */
  advertencia: boolean;
  /** El borrador tiene dirección, asunto y contenido. */
  completo: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(
    enviarCorreo,
    estadoInicial,
  );
  const [aceptada, setAceptada] = useState(false);
  const idAdvertencia = `advertencia-${correoId}`;

  return (
    <FormularioConCarga
      action={accion}
      onSubmit={(evento) => {
        if (
          !window.confirm(
            "¿Enviar este correo? Después no se puede editar ni deshacer.",
          )
        )
          evento.preventDefault();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="correo_id" value={correoId} />
      <input type="hidden" name="clave_envio" value={claveEnvio} />
      {estado.mensaje && !estado.errores?.con_advertencia && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}
      {advertencia && (
        <div
          role="alert"
          className="rounded-lg border border-amarillo/40 bg-amarillo/15 p-3 text-sm text-tinta"
        >
          <p className="font-medium">
            El vínculo indica que este apoderado no puede ser contactado.
          </p>
          <label
            htmlFor={idAdvertencia}
            className="mt-2 flex cursor-pointer items-start gap-2"
          >
            <input
              id={idAdvertencia}
              type="checkbox"
              name="con_advertencia"
              value="si"
              checked={aceptada}
              onChange={(evento) => setAceptada(evento.target.checked)}
              aria-invalid={estado.errores?.con_advertencia ? true : undefined}
              className="mt-0.5 accent-primary"
            />
            <span>
              Entiendo la advertencia y quiero enviarlo igual. Quedará
              registrado en la auditoría.
            </span>
          </label>
          {estado.errores?.con_advertencia && (
            <p className="mt-1 text-destructive">
              {estado.errores.con_advertencia}
            </p>
          )}
        </div>
      )}
      {!completo && (
        <p className="text-sm text-muted-foreground">
          Para enviarlo, completa la dirección del destinatario en el borrador.
        </p>
      )}
      <button
        type="submit"
        disabled={pendiente || !completo || (advertencia && !aceptada)}
        className={claseBotonPrimario}
      >
        {pendiente ? "Enviando…" : "Confirmar y enviar"}
      </button>
    </FormularioConCarga>
  );
}

// HU-076 CA2: un correo confirmado o enviado no cambia; se copia en un
// borrador nuevo para corregirlo.
export function BotonCopiarCorreo({
  casoId,
  correoId,
}: {
  casoId: string;
  correoId: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    copiarCorreo,
    estadoInicial,
  );
  return (
    <FormularioConCarga action={accion} className="space-y-2">
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="correo_id" value={correoId} />
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <button
        type="submit"
        disabled={pendiente}
        className={claseBotonSecundario}
      >
        {pendiente ? "Copiando…" : "Usar como borrador nuevo"}
      </button>
    </FormularioConCarga>
  );
}
