"use client";

import { useActionState } from "react";
import { BotonEnviar, Campo } from "@/app/components/formulario";
import { LARGO_MAXIMO } from "../limites";
import { solicitarRecuperacion, type EstadoRecuperacion } from "./acciones";

const inicial: EstadoRecuperacion = {};

export function FormularioRecuperacion() {
  const [estado, accion, pendiente] = useActionState(
    solicitarRecuperacion,
    inicial,
  );
  if (estado.enviado)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Si existe una cuenta asociada a ese correo, recibirás un enlace para
        recuperar tu contraseña. Revisa también spam. Si no llega, espera unos
        minutos y vuelve a solicitarlo.
      </p>
    );
  return (
    <form action={accion} noValidate className="space-y-5">
      <Campo
        name="correo"
        etiqueta="Correo"
        type="email"
        autoComplete="email"
        required
        maxLength={LARGO_MAXIMO.correo}
        defaultValue={estado.correo}
        error={estado.errores?.correo}
      />
      <BotonEnviar pendiente={pendiente} textoPendiente="Solicitando…">
        Enviar enlace
      </BotonEnviar>
    </form>
  );
}
