"use client";

import { useActionState } from "react";
import { activarCuenta, type EstadoFormulario } from "../acciones";
import { CampoContrasena } from "@/app/components/campo-contrasena";
import { AvisoError, BotonEnviar } from "@/app/components/formulario";
import { LARGO_MINIMO_CONTRASENA } from "../limites";

const estadoInicial: EstadoFormulario = {};

export function FormularioActivacion({
  tokenHash,
  membresia,
  tipoToken = "invite",
}: {
  tokenHash: string;
  membresia: string;
  tipoToken?: "invite" | "magiclink";
}) {
  const [estado, accion, pendiente] = useActionState(
    activarCuenta,
    estadoInicial,
  );

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}

      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="membresia" value={membresia} />
      <input type="hidden" name="tipo_token" value={tipoToken} />
      <CampoContrasena
        name="contrasena"
        etiqueta="Contraseña"
        autoComplete="new-password"
        required
        minLength={LARGO_MINIMO_CONTRASENA}
        ayuda={`Mínimo ${LARGO_MINIMO_CONTRASENA} caracteres.`}
        error={estado.errores?.contrasena}
      />
      <CampoContrasena
        name="confirmacion"
        etiqueta="Repite la contraseña"
        autoComplete="new-password"
        required
        error={estado.errores?.confirmacion}
      />

      <BotonEnviar pendiente={pendiente} textoPendiente="Activando…">
        Activar cuenta
      </BotonEnviar>
    </form>
  );
}
