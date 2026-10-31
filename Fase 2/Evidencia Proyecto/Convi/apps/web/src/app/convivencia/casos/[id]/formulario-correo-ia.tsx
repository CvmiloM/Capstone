"use client";

import { useActionState, useEffect, useState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import {
  MascotaIA,
  type FaseMascota,
  type MensajesMascota,
} from "@/app/components/normativa/mascota-ia";
import type { DestinatarioCorreo } from "../datos";
import type { EstadoAccion } from "./acciones";
import { prepararCorreoConIA } from "./acciones-correos";
import { Campo, propsControl } from "./formularios";
import { LARGO_MAXIMO_INDICACION } from "./opciones";

// PB-086 (HU-075): la IA prepara el borrador del correo al apoderado. Decisión
// del PO (2026-10-31): la IA solo recibe esta indicación con seudónimos, no el
// expediente, y CONVI pone los nombres reales y la firma.
const estadoInicial: EstadoAccion = {};
const FASES_ESPERA: FaseMascota[] = ["pensando", "escribiendo"];
const MENSAJES: MensajesMascota = {
  reposo: "Dime a qué apoderado le escribes y qué quieres comunicar",
  pensando: "Leyendo tu indicación…",
  escribiendo: "Redactando el borrador…",
  error: "No pude preparar el borrador, revisa el mensaje de abajo",
};

export function FormularioCorreoIA({
  casoId,
  destinatarios,
}: {
  casoId: string;
  destinatarios: DestinatarioCorreo[];
}) {
  const [estado, accion, pendiente] = useActionState(
    prepararCorreoConIA,
    estadoInicial,
  );
  const [paso, setPaso] = useState(0);
  const errores = estado.errores ?? {};
  const apoderados = destinatarios.filter((d) => d.rol === "APODERADO");

  useEffect(() => {
    if (!pendiente) return;
    const escribir = setTimeout(() => setPaso(1), 2500);
    return () => clearTimeout(escribir);
  }, [pendiente]);

  const fase: FaseMascota = pendiente
    ? FASES_ESPERA[paso]
    : estado.mensaje && !estado.errores
      ? "error"
      : "reposo";

  if (apoderados.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Ningún estudiante del caso tiene un apoderado con vínculo vigente,
        puedes redactar el correo a mano escribiendo la dirección.
      </p>
    );

  return (
    <div className="space-y-4">
      <MascotaIA fase={fase} mensajes={MENSAJES} />
      <form
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
          <Campo
            id="correo_ia_persona"
            etiqueta="Apoderado"
            error={errores.persona_destinataria_id}
          >
            <select
              {...propsControl(
                "correo_ia_persona",
                errores.persona_destinataria_id,
                false,
                "persona_destinataria_id",
              )}
              defaultValue={estado.valores?.persona_destinataria_id ?? ""}
            >
              <option value="" disabled>
                Elige al apoderado
              </option>
              {apoderados.map((d) => (
                <option key={d.persona_id} value={d.persona_id}>
                  {d.nombre}
                  {d.detalle ? ` (${d.detalle})` : ""}
                  {d.correo ? "" : " · sin correo en su ficha"}
                  {d.no_contactable ? " · no contactable según su vínculo" : ""}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            id="correo_ia_indicacion"
            etiqueta="¿Qué quieres comunicar?"
            error={errores.indicacion}
            ayuda="Por ejemplo: citar a una reunión el jueves 6 a las 10:00 en la oficina de convivencia para conversar sobre lo ocurrido en el recreo. La IA no ve el expediente del caso, solo lo que escribas aquí."
          >
            <textarea
              {...propsControl(
                "correo_ia_indicacion",
                errores.indicacion,
                true,
                "indicacion",
              )}
              rows={4}
              maxLength={LARGO_MAXIMO_INDICACION}
              defaultValue={estado.valores?.indicacion ?? ""}
            />
          </Campo>
        </fieldset>
        <p className="text-sm text-muted-foreground">
          El borrador queda marcado como generado con IA y no se envía: lo
          revisas y corriges antes de confirmarlo.
        </p>
        <button
          type="submit"
          disabled={pendiente}
          className={claseBotonPrimario}
        >
          {pendiente ? "Preparando…" : "Preparar borrador con IA"}
        </button>
      </form>
    </div>
  );
}
