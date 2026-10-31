"use client";

import { useActionState, useState } from "react";
import { ACEPTA, TAMANO_MAXIMO } from "@/app/components/evidencias/opciones";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import type { DetalleCaso } from "../datos";
import type { EstadoAccion } from "./acciones";
import { registrarComunicacion } from "./acciones-comunicaciones";
import { Campo, propsControl } from "./formularios";
import {
  DESTINATARIO_EXTERNO,
  LARGO_MAXIMO_DESTINATARIO_EXTERNO,
  LARGO_MAXIMO_RESUMEN_COMUNICACION,
  NOMBRE_ROL_ASISTENTE,
  TIPOS_COMUNICACION,
} from "./opciones";

// PB-067 (HU-058): registro de una comunicación del caso. El tamaño del
// respaldo se revisa también aquí para no subir 25 MB en vano.
const estadoInicial: EstadoAccion = {};
const ROLES = ["ESTUDIANTE", "APODERADO", "EQUIPO"];

export function FormularioComunicacion({
  casoId,
  destinatarios,
  ahora,
}: {
  casoId: string;
  destinatarios: DetalleCaso["destinatarios_comunicacion"];
  /** AAAA-MM-DDTHH:MM de la escuela: lo ocurrido no puede ser futuro. */
  ahora: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    registrarComunicacion,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const [elegido, setElegido] = useState("");
  const [pesado, setPesado] = useState<EstadoAccion | null>(null);
  const errores: Record<string, string> = {
    ...estado.errores,
    ...(pesado === estado ? { archivo: "El archivo pesa más de 25 MB." } : {}),
  };
  // CA5: se avisa antes de registrar; la comunicación se guarda igual.
  const advertencia = destinatarios.some(
    (d) => d.persona_id === elegido && d.no_contactable,
  );

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
      <input type="hidden" name="caso_id" value={casoId} />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="comunicacion_tipo" etiqueta="Tipo" error={errores.tipo}>
          <select
            {...propsControl("comunicacion_tipo", errores.tipo, false, "tipo")}
            defaultValue={valores.tipo ?? ""}
          >
            <option value="" disabled>
              Elige un tipo
            </option>
            {TIPOS_COMUNICACION.map((tipo) => (
              <option key={tipo.valor} value={tipo.valor}>
                {tipo.texto}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          id="comunicacion_ocurrido"
          etiqueta="Fecha y hora en que ocurrió"
          error={errores.ocurrido_en}
        >
          <input
            {...propsControl(
              "comunicacion_ocurrido",
              errores.ocurrido_en,
              false,
              "ocurrido_en",
            )}
            type="datetime-local"
            max={ahora}
            defaultValue={valores.ocurrido_en}
          />
        </Campo>
      </div>

      <Campo
        id="comunicacion_destinatario"
        etiqueta="Destinatario"
        error={errores.persona_destinataria_id}
      >
        <select
          {...propsControl(
            "comunicacion_destinatario",
            errores.persona_destinataria_id,
            false,
            "persona_destinataria_id",
          )}
          value={elegido}
          onChange={(evento) => setElegido(evento.target.value)}
        >
          <option value="" disabled>
            Elige a quién fue la comunicación
          </option>
          {ROLES.map((rol) => {
            const grupo = destinatarios.filter((d) => d.rol === rol);
            return grupo.length === 0 ? null : (
              <optgroup key={rol} label={NOMBRE_ROL_ASISTENTE[rol] ?? rol}>
                {grupo.map((d) => (
                  <option key={`${rol}-${d.persona_id}`} value={d.persona_id}>
                    {d.nombre}
                    {d.detalle ? ` (${d.detalle})` : ""}
                    {d.no_contactable ? " · no contactable según su vínculo" : ""}
                  </option>
                ))}
              </optgroup>
            );
          })}
          <option value={DESTINATARIO_EXTERNO}>Otro destinatario, fuera del caso</option>
        </select>
      </Campo>

      {advertencia && (
        <div
          role="alert"
          className="rounded-lg border border-naranjo/40 bg-naranjo/10 px-4 py-3 text-sm"
        >
          El vínculo indica que este apoderado no puede ser contactado. Puedes
          registrar la comunicación igual: la advertencia queda en la auditoría.
        </div>
      )}

      {elegido === DESTINATARIO_EXTERNO && (
        <Campo
          id="comunicacion_externo"
          etiqueta="Destinatario externo"
          error={errores.destinatario_externo}
          ayuda="Por ejemplo: OPD Temuco, o Carabineros, sargento Pérez."
        >
          <input
            {...propsControl(
              "comunicacion_externo",
              errores.destinatario_externo,
              true,
              "destinatario_externo",
            )}
            type="text"
            maxLength={LARGO_MAXIMO_DESTINATARIO_EXTERNO}
            defaultValue={valores.destinatario_externo}
          />
        </Campo>
      )}

      <Campo id="comunicacion_resumen" etiqueta="Resumen" error={errores.resumen}>
        <textarea
          {...propsControl("comunicacion_resumen", errores.resumen, false, "resumen")}
          rows={4}
          maxLength={LARGO_MAXIMO_RESUMEN_COMUNICACION}
          defaultValue={valores.resumen}
        />
      </Campo>

      <Campo
        id="comunicacion_archivo"
        etiqueta="Respaldo (opcional)"
        error={errores.archivo}
        ayuda={`PDF, Word (DOCX), imagen JPG, PNG o WEBP, o correo exportado (EML), de hasta 25 MB.${estado.errores ? " Vuelve a elegir el archivo." : ""}`}
      >
        <input
          {...propsControl("comunicacion_archivo", errores.archivo, true, "archivo")}
          type="file"
          accept={ACEPTA}
        />
      </Campo>

      <p className="text-sm text-muted-foreground">
        Queda registrada con tu nombre y la fecha de registro. Una comunicación
        no se edita, no se borra ni cambia de caso.
      </p>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Registrando…" : "Registrar comunicación"}
      </button>
    </form>
  );
}
