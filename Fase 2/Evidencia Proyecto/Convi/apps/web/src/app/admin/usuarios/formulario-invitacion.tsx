"use client";

import { useActionState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { invitarCuenta, type EstadoInvitacion } from "./acciones";
import { LARGO_MAXIMO, PERFILES_INVITABLES } from "./opciones";

const estadoInicial: EstadoInvitacion = {};

// PB-010 (HU-009): invitar a una persona del equipo. La API vuelve a validar
// cada dato; aquí solo se muestran sus mensajes junto a cada campo.
export function FormularioInvitacion() {
  const [estado, accion, pendiente] = useActionState(
    invitarCuenta,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}
      {estado.invitado && (
        <div
          role="status"
          className="rounded-lg border border-verde/30 bg-verde/10 px-3 py-2.5 text-sm"
        >
          Enviamos la invitación a{" "}
          <strong className="font-medium">{estado.invitado}</strong>. La cuenta
          queda Pendiente hasta que la persona la active desde su correo.
        </div>
      )}

      <Campo
        name="nombres"
        etiqueta="Nombres"
        autoComplete="off"
        required
        maxLength={LARGO_MAXIMO.nombres}
        defaultValue={valores.nombres}
        error={errores.nombres}
      />
      <Campo
        name="apellidos"
        etiqueta="Apellidos"
        autoComplete="off"
        required
        maxLength={LARGO_MAXIMO.apellidos}
        defaultValue={valores.apellidos}
        error={errores.apellidos}
      />
      <Campo
        name="correo"
        etiqueta="Correo"
        type="email"
        autoComplete="off"
        required
        maxLength={LARGO_MAXIMO.correo}
        defaultValue={valores.correo}
        error={errores.correo}
        ayuda="Cada cuenta necesita su propio correo."
      />

      <fieldset aria-describedby={errores.perfil ? "perfil-error" : "perfil-ayuda"}>
        <legend className="text-sm font-medium">Perfil</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {PERFILES_INVITABLES.map((perfil) => (
            <label
              key={perfil.valor}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name="perfil"
                value={perfil.valor}
                defaultChecked={valores.perfil === perfil.valor}
                className="accent-primary"
              />
              {perfil.texto}
            </label>
          ))}
        </div>
        {errores.perfil ? (
          <p id="perfil-error" className="mt-1.5 text-sm text-destructive">
            {errores.perfil}
          </p>
        ) : (
          <p id="perfil-ayuda" className="mt-1.5 text-sm text-muted-foreground">
            El perfil no se puede cambiar después: otro perfil requiere otra
            cuenta con otro correo.
          </p>
        )}
      </fieldset>

      <BotonEnviar pendiente={pendiente} textoPendiente="Enviando invitación…">
        Enviar invitación
      </BotonEnviar>
    </form>
  );
}
