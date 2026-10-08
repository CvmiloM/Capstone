"use client";

import { useActionState } from "react";
import { registrarAdministrador, type EstadoFormulario } from "../acciones";
import { CampoContrasena } from "@/app/components/campo-contrasena";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { LARGO_MAXIMO, LARGO_MINIMO_CONTRASENA } from "../limites";

const estadoInicial: EstadoFormulario = {};

export function FormularioRegistro() {
  const [estado, accion, pendiente] = useActionState(
    registrarAdministrador,
    estadoInicial,
  );

  if (estado.exito) {
    return (
      <div role="status" className="rounded-lg border border-primary/15 bg-accent p-5">
        <h2 className="font-semibold text-accent-foreground">
          Revisa tu correo
        </h2>
        <p className="mt-2 text-sm">
          Te enviamos un enlace de verificación a{" "}
          <strong className="font-medium">{estado.valores?.correo}</strong>.
          Ábrelo para continuar con el registro de tu establecimiento.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Si no lo ves en unos minutos, revisa la carpeta de spam.
        </p>
      </div>
    );
  }

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="nombres"
          etiqueta="Nombres"
          autoComplete="given-name"
          required
          maxLength={LARGO_MAXIMO.nombres}
          defaultValue={estado.valores?.nombres}
          error={estado.errores?.nombres}
        />
        <Campo
          name="apellidos"
          etiqueta="Apellidos"
          autoComplete="family-name"
          required
          maxLength={LARGO_MAXIMO.apellidos}
          defaultValue={estado.valores?.apellidos}
          error={estado.errores?.apellidos}
        />
      </div>
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
      <Campo
        name="telefono"
        etiqueta="Teléfono (opcional)"
        type="tel"
        autoComplete="tel"
        maxLength={LARGO_MAXIMO.telefono}
        placeholder="+56 9 1234 5678"
        defaultValue={estado.valores?.telefono}
        error={estado.errores?.telefono}
      />
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

      <BotonEnviar pendiente={pendiente} textoPendiente="Creando cuenta…">
        Crear cuenta
      </BotonEnviar>
    </form>
  );
}
