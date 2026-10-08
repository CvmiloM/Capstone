"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoFormulario } from "../acciones";
import { CampoContrasena } from "@/app/components/campo-contrasena";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { LARGO_MAXIMO } from "../limites";

const estadoInicial: EstadoFormulario = {};

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, estadoInicial);

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}

      <Campo
        name="correo"
        etiqueta="Correo"
        type="email"
        autoComplete="email"
        required
        maxLength={LARGO_MAXIMO.correo}
        defaultValue={estado.valores?.correo}
        error={estado.errores?.correo}
      />
      <CampoContrasena
        name="contrasena"
        etiqueta="Contraseña"
        autoComplete="current-password"
        required
        error={estado.errores?.contrasena}
      />

      <BotonEnviar pendiente={pendiente} textoPendiente="Ingresando…">
        Iniciar sesión
      </BotonEnviar>
    </form>
  );
}
