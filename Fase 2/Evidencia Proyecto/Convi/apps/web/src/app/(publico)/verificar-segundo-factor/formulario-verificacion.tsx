"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import {
  AvisoError,
  BotonEnviar,
  Campo,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import {
  consultarVerificacion,
  verificarSegundoFactor,
  type EstadoVerificacion,
} from "./acciones";

export function FormularioVerificacion({
  inicial,
}: {
  inicial: EstadoVerificacion;
}) {
  const [estado, cambiarEstado] = useState(inicial);
  const [codigo, cambiarCodigo] = useState("");
  const [pendiente, iniciarTransicion] = useTransition();

  function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendiente) return;
    const formulario = new FormData();
    formulario.set("codigo", codigo);
    // El código no se conserva al terminar un intento ni se guarda en el navegador.
    cambiarCodigo("");
    iniciarTransicion(async () => {
      try {
        cambiarEstado(await verificarSegundoFactor(formulario));
      } catch {
        cambiarEstado({
          paso: "codigo",
          mensaje: "No pudimos conectar. Inténtalo nuevamente.",
        });
      }
    });
  }

  if (estado.paso === "codigo") {
    return (
      <form onSubmit={confirmar} noValidate className="space-y-5">
        <div className="rounded-lg border border-primary/15 bg-accent p-4 text-sm">
          <p className="font-medium text-accent-foreground">
            Abre tu aplicación autenticadora
          </p>
          <p className="mt-1 text-muted-foreground">
            Busca la cuenta de CONVI que ya vinculaste y escribe su código
            actual.
          </p>
        </div>
        {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
        <div aria-live="polite">
          <Campo
            name="codigo"
            etiqueta="Código de seis dígitos"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={codigo}
            onChange={(evento) => cambiarCodigo(evento.target.value)}
            placeholder="000000"
            ayuda="El código cambia periódicamente. Usa el que muestra tu aplicación ahora."
            error={estado.errorCodigo}
            disabled={pendiente}
          />
        </div>
        <BotonEnviar pendiente={pendiente} textoPendiente="Verificando…">
          Verificar código
        </BotonEnviar>
        <p className="text-xs text-muted-foreground">
          Este paso protege las funciones de Administración y Convivencia.
        </p>
      </form>
    );
  }

  if (estado.paso === "completado") {
    return (
      <div className="space-y-5">
        <div
          role="status"
          className="rounded-lg border border-primary/15 bg-accent p-5"
        >
          <h2 className="font-semibold text-accent-foreground">
            Acceso comprobado
          </h2>
          <p className="mt-2 text-sm">
            {estado.mensaje ||
              "Tu sesión cumple los requisitos de acceso de tu perfil."}
          </p>
        </div>
        {/* Consultar el portal con la sesión actual, sin reutilizar una vista anterior. */}
        <a
          href={estado.destino || "/"}
          className={`w-full ${claseBotonPrimario}`}
        >
          {estado.destino ? "Continuar al portal" : "Volver al inicio"}
        </a>
      </div>
    );
  }

  if (estado.paso === "configurar") {
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Primero vincula una aplicación autenticadora a tu cuenta. La
          necesitarás para acceder a tus funciones.
        </p>
        <Link href="/segundo-factor" className={`w-full ${claseBotonPrimario}`}>
          Configurar segundo factor
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AvisoError>
        {estado.mensaje || "Tu sesión terminó. Inicia sesión nuevamente."}
      </AvisoError>
      {estado.paso === "sin-sesion" ? (
        <Link href="/login" className={`w-full ${claseBotonPrimario}`}>
          Ir a iniciar sesión
        </Link>
      ) : (
        <button
          type="button"
          disabled={pendiente}
          className={`w-full ${claseBotonPrimario}`}
          onClick={() =>
            iniciarTransicion(async () => {
              try {
                cambiarEstado(await consultarVerificacion());
              } catch {
                cambiarEstado({
                  paso: "bloqueado",
                  mensaje: "No pudimos conectar. Inténtalo nuevamente.",
                });
              }
            })
          }
        >
          {pendiente ? "Consultando…" : "Volver a consultar"}
        </button>
      )}
      <Link href="/" className={`w-full ${claseBotonSecundario}`}>
        Volver al inicio
      </Link>
    </div>
  );
}
