"use client";

import { useActionState, useId } from "react";
import { AvisoError, claseBotonSecundario } from "@/app/components/formulario";
import { reactivarUsuario, type EstadoSuspension } from "./acciones";

export function FormularioReactivacion({
  cuentaId,
  nombre,
  filtros,
}: {
  cuentaId: string;
  nombre: string;
  filtros: { perfil: string; suspendidas: boolean };
}) {
  const idMotivo = useId();
  const [estado, accion, pendiente] = useActionState<
    EstadoSuspension,
    FormData
  >(reactivarUsuario.bind(null, cuentaId), {});
  return (
    <details className="text-sm">
      <summary className="w-fit cursor-pointer text-xs font-medium text-primary">
        Reactivar cuenta
      </summary>
      <form action={accion} className="mt-3 space-y-3">
        <input type="hidden" name="perfil" value={filtros.perfil} />
        <input
          type="hidden"
          name="suspendidas"
          value={filtros.suspendidas ? "1" : "0"}
        />
        <p>
          Si reactivas a {nombre}, recuperará su acceso con el mismo correo y
          contraseña, conservando su perfil y su segundo factor cuando
          corresponda
        </p>
        <div>
          <label htmlFor={idMotivo} className="block text-sm font-medium">
            Motivo de reactivación
          </label>
          <textarea
            id={idMotivo}
            name="motivo"
            required
            maxLength={500}
            rows={2}
            className="mt-1.5 block w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15"
          />
        </div>
        <button
          type="submit"
          disabled={pendiente}
          className={`${claseBotonSecundario} px-3! py-1.5! text-xs! disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {pendiente ? "Reactivando…" : "Confirmar reactivación"}
        </button>
        {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      </form>
    </details>
  );
}
