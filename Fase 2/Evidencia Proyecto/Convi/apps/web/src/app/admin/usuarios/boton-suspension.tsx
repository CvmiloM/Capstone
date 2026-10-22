"use client";

import { useActionState } from "react";
import { AvisoError, claseBotonSecundario } from "@/app/components/formulario";
import { suspenderUsuario, type EstadoSuspension } from "./acciones";

export function BotonSuspension({
  cuentaId,
  nombre,
  perfil,
  filtros,
}: {
  cuentaId: string;
  nombre: string;
  perfil: string;
  filtros: { perfil: string; suspendidas: boolean };
}) {
  const [estado, accion, pendiente] = useActionState<
    EstadoSuspension,
    FormData
  >(suspenderUsuario.bind(null, cuentaId), {});

  return (
    <details className="text-sm">
      <summary className="w-fit cursor-pointer text-xs font-medium text-destructive">
        Suspender cuenta
      </summary>
      <form action={accion} className="mt-3 space-y-3">
        <input type="hidden" name="perfil" value={filtros.perfil} />
        <input
          type="hidden"
          name="suspendidas"
          value={filtros.suspendidas ? "1" : "0"}
        />
        <p>
          Si confirmas la suspensión de {nombre}, perderá el acceso a CONVI
          desde su siguiente solicitud, pero sus registros históricos se
          conservarán
        </p>
        {perfil === "ADMIN" && (
          <p className="font-medium">
            Estás suspendiendo a otro administrador de tu escuela, ¿estás
            seguro?
          </p>
        )}
        <p className="text-muted-foreground">
          Esta acción no elimina la cuenta
        </p>
        <button
          type="submit"
          disabled={pendiente}
          className={`${claseBotonSecundario} px-3! py-1.5! text-xs! text-destructive disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {pendiente ? "Suspendiendo…" : "Confirmar suspensión"}
        </button>
        {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      </form>
    </details>
  );
}
