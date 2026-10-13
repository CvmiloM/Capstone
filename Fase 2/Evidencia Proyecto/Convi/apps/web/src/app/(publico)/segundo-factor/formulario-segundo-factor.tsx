"use client";

import { useState, useTransition, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  configurarSegundoFactor,
  consultarSegundoFactor,
  type EstadoSegundoFactor,
} from "./acciones";
import {
  AvisoError,
  BotonEnviar,
  Campo,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";

export function FormularioSegundoFactor({
  inicial,
}: {
  inicial: EstadoSegundoFactor;
}) {
  const [estado, cambiarEstado] = useState(inicial);
  const [pendiente, iniciarTransicion] = useTransition();
  const [codigo, cambiarCodigo] = useState("");
  const { paso, mensaje, errorCodigo } = estado;

  function enviar(operacion: "preparar" | "confirmar" | "cancelar") {
    if (pendiente) return;
    const formulario = new FormData();
    formulario.set("operacion", operacion);
    if (estado.factorId) formulario.set("factorId", estado.factorId);
    if (operacion === "confirmar") formulario.set("codigo", codigo);
    // El código se usa una vez; el QR vive solo mientras se confirma este intento.
    cambiarCodigo("");
    iniciarTransicion(async () => {
      try {
        const siguiente = await configurarSegundoFactor(formulario);
        cambiarEstado(
          siguiente.paso === "confirmar"
            ? {
                ...siguiente,
                qr: siguiente.qr ?? estado.qr,
                factorId: siguiente.factorId ?? estado.factorId,
              }
            : siguiente,
        );
      } catch {
        cambiarEstado({
          ...estado,
          mensaje: "No pudimos conectar. Inténtalo nuevamente.",
          errorCodigo: undefined,
        });
      }
    });
  }

  function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    enviar("confirmar");
  }

  if (paso === "bloqueado" || paso === "sin-sesion") {
    return (
      <div className="space-y-5">
        <AvisoError>
          {mensaje || "Tu sesión terminó. Inicia sesión nuevamente."}
        </AvisoError>
        {paso === "sin-sesion" ? (
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
                  cambiarEstado(await consultarSegundoFactor());
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
      </div>
    );
  }

  if (paso === "preparar") {
    return (
      <div className="space-y-5">
        {mensaje && <AvisoError>{mensaje}</AvisoError>}
        <ol className="space-y-4 text-sm">
          <li>
            <p className="font-medium">
              1. Ten a mano tu aplicación autenticadora
            </p>
            <p className="mt-1 text-muted-foreground">
              La usarás para generar un código de seis dígitos cuando ingreses a
              CONVI.
            </p>
            <p className="mt-3 text-muted-foreground">
              Si aún no tienes una, puedes instalar cualquiera de estas:
            </p>
            <div className="mt-3 grid gap-2">
              <a
                href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2&hl=es"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Google Authenticator en Google Play (se abre en otra pestaña)"
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-3 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-primary">
                    Google Authenticator
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Google LLC
                  </span>
                </span>
                <span className="shrink-0 rounded bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
                  Google Play
                </span>
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.azure.authenticator&hl=es"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Microsoft Authenticator en Google Play (se abre en otra pestaña)"
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-3 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-primary">
                    Microsoft Authenticator
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Microsoft Corporation
                  </span>
                </span>
                <span className="shrink-0 rounded bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
                  Google Play
                </span>
              </a>
            </div>
          </li>
          <li>
            <p className="font-medium">
              2. Vincula tu cuenta y confirma el código
            </p>
            <p className="mt-1 text-muted-foreground">
              En el siguiente paso podrás escanear el QR y confirmar el código
              que muestre tu aplicación.
            </p>
          </li>
        </ol>
        <button
          type="button"
          disabled={pendiente}
          className={`w-full ${claseBotonPrimario}`}
          onClick={() => enviar("preparar")}
        >
          {pendiente ? "Preparando…" : "Preparar configuración"}
        </button>
        <p className="text-xs text-muted-foreground">
          Administración y Convivencia necesitan este paso antes de acceder a
          sus funciones.
        </p>
      </div>
    );
  }

  if (paso === "completado") {
    return (
      <div className="space-y-5">
        <div
          role="status"
          className="rounded-lg border border-primary/15 bg-accent p-5"
        >
          <h2 className="font-semibold text-accent-foreground">
            Configuración confirmada
          </h2>
          <p className="mt-2 text-sm">
            Tu aplicación autenticadora quedó vinculada. Sus códigos protegerán
            el acceso a tu cuenta.
          </p>
        </div>
        {/* Pedir una página nueva evita reutilizar el estado anterior a vincular la aplicación. */}
        <a
          href="/verificar-segundo-factor"
          className={`w-full ${claseBotonSecundario}`}
        >
          Continuar
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={confirmar} noValidate className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">1. Escanea el código QR</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Abre tu aplicación autenticadora y elige agregar una cuenta.
        </p>
        <div className="mx-auto mt-4 w-fit rounded-xl border border-border bg-card p-3">
          <Image
            src={estado.qr!}
            alt="Código QR para vincular tu cuenta de CONVI con tu aplicación autenticadora"
            width={184}
            height={184}
            unoptimized
          />
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <h2 className="mb-3 text-base font-semibold">
          2. Confirma la configuración
        </h2>
        {mensaje && (
          <div className="mb-3">
            <AvisoError>{mensaje}</AvisoError>
          </div>
        )}
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
            ayuda="Escribe el código actual de tu aplicación autenticadora."
            error={errorCodigo}
            aria-invalid={!!errorCodigo || !!mensaje}
            disabled={pendiente}
          />
        </div>
      </div>
      <BotonEnviar pendiente={pendiente} textoPendiente="Confirmando…">
        Confirmar configuración
      </BotonEnviar>
      <button
        type="button"
        disabled={pendiente}
        className={`w-full ${claseBotonSecundario}`}
        onClick={() => enviar("cancelar")}
      >
        Volver
      </button>
    </form>
  );
}
