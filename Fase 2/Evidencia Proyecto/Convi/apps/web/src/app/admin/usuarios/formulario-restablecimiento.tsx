"use client";

import { useActionState, useId, useState } from "react";
import { AvisoError, claseBotonSecundario } from "@/app/components/formulario";
import { SelectorFiltro } from "@/app/components/selector-filtro";
import { restablecerAutenticador, type EstadoSuspension } from "./acciones";

export function FormularioRestablecimiento({ cuentaId, solicitudId, nombre, filtros }: {
  cuentaId: string;
  solicitudId: string;
  nombre: string;
  filtros: { perfil: string; suspendidas: boolean };
}) {
  const id = useId();
  const [medio, cambiarMedio] = useState("");
  const [estado, accion, pendiente] = useActionState<EstadoSuspension, FormData>(
    restablecerAutenticador.bind(null, cuentaId, solicitudId), {},
  );
  return (
    <details className="text-sm">
      <summary className="w-fit cursor-pointer rounded-lg text-xs font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        Restablecer segundo factor
      </summary>
      <form action={accion} className="mt-3 space-y-4 rounded-2xl border border-border bg-muted/30 p-4" aria-busy={pendiente}>
        <input type="hidden" name="perfil" value={filtros.perfil} />
        <input type="hidden" name="suspendidas" value={filtros.suspendidas ? "1" : "0"} />
        <p>Usa esta opción si {nombre} perdió su aplicación autenticadora, primero verifica su identidad por un medio acordado fuera de CONVI</p>
        <p className="text-muted-foreground">Al confirmar, su aplicación anterior dejará de servir y tendrá que iniciar sesión con su contraseña y configurar una nueva antes de entrar al portal</p>
        <fieldset disabled={pendiente} className="space-y-4 disabled:opacity-60">
          <SelectorFiltro nombre="medio" etiqueta="Cómo verificaste su identidad" valor={medio} cambiar={cambiarMedio} opciones={[
            ["", "Elige el medio utilizado"], ["PRESENCIAL", "Presencialmente"],
            ["VIDEOLLAMADA", "Por videollamada"], ["CANAL_INSTITUCIONAL", "Por un canal institucional acordado"],
          ]} />
          <div>
            <label htmlFor={`${id}-motivo`} className="block text-sm font-medium">Motivo del restablecimiento</label>
            <textarea id={`${id}-motivo`} name="motivo" required maxLength={500} rows={2}
              placeholder="Por ejemplo: perdió el teléfono y verificamos su identidad presencialmente"
              className="mt-1.5 block w-full rounded-xl border border-input bg-card px-3 py-2 outline-none focus:border-ring focus:ring-3 focus:ring-ring/15" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="identidad_verificada" value="si" required className="mt-1 size-4 accent-primary" />
            Confirmo que verifiqué la identidad de esta persona y que solicitó recuperar su autenticador
          </label>
          <button type="submit" disabled={!medio || pendiente}
            className={`${claseBotonSecundario} px-3! py-1.5! text-xs! disabled:cursor-not-allowed disabled:opacity-60`}>
            {pendiente ? "Restableciendo…" : "Confirmar restablecimiento"}
          </button>
        </fieldset>
        {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      </form>
    </details>
  );
}
