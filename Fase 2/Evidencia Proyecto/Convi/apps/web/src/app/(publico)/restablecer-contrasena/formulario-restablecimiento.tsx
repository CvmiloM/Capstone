"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CampoContrasena } from "@/app/components/campo-contrasena";
import {
  AvisoError,
  BotonEnviar,
  Campo,
  claseEnlace,
} from "@/app/components/formulario";
import { LARGO_MINIMO_CONTRASENA } from "../limites";
import {
  aceptarEnlaceRecuperacion,
  restablecerContrasena,
  type EstadoRecuperacion,
} from "../recuperar-contrasena/acciones";

const inicial: EstadoRecuperacion = {};

export function FormularioRestablecimiento({
  tokenHash,
  requiereCodigo = false,
  estadoInicial = inicial,
}: {
  tokenHash?: string;
  requiereCodigo?: boolean;
  estadoInicial?: EstadoRecuperacion;
}) {
  const [estado, accion, pendiente] = useActionState(
    tokenHash ? aceptarEnlaceRecuperacion : restablecerContrasena,
    estadoInicial,
  );
  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      {estado.paso !== "invalido" &&
        (tokenHash ? (
          <>
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="tipo" value="recovery" />
            <BotonEnviar pendiente={pendiente} textoPendiente="Comprobando…">
              Continuar
            </BotonEnviar>
          </>
        ) : (
          <>
            <CampoContrasena
              name="contrasena"
              etiqueta="Nueva contraseña"
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
            {(estado.paso === "codigo" ||
              (requiereCodigo && estado.paso !== "contrasena")) && (
              <Campo
                name="codigo"
                etiqueta="Código del autenticador"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                required
                ayuda="Si perdiste la aplicación, necesitas restablecer el segundo factor; recuperar la contraseña no lo elimina."
                error={estado.errores?.codigo}
              />
            )}
            <BotonEnviar pendiente={pendiente} textoPendiente="Guardando…">
              Guardar contraseña
            </BotonEnviar>
          </>
        ))}
      <p className="text-sm">
        <Link href="/recuperar-contrasena" className={claseEnlace}>
          Solicitar otro enlace
        </Link>
      </p>
    </form>
  );
}
