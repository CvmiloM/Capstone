"use client";

import NextForm from "next/form";
import NextLink, { useLinkStatus } from "next/link";
import {
  type ComponentProps,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal, useFormStatus } from "react-dom";

const operaciones = new Map<symbol, "navegacion" | "envio">();
const observadores = new Set<() => void>();
const notificar = () => observadores.forEach((avisar) => avisar());
const suscribir = (avisar: () => void) => {
  observadores.add(avisar);
  return () => {
    observadores.delete(avisar);
  };
};
const mensajeActual = () =>
  operaciones.size === 0
    ? ""
    : [...operaciones.values()].includes("envio")
      ? "Procesando…"
      : "Cargando…";

/** Cada operación retira solo su aviso, aunque otra siga esperando. */
export function CargaActiva({
  activa = true,
  envio = false,
}: {
  activa?: boolean;
  envio?: boolean;
}) {
  useEffect(() => {
    if (!activa) return;
    const id = Symbol();
    operaciones.set(id, envio ? "envio" : "navegacion");
    notificar();
    return () => {
      operaciones.delete(id);
      notificar();
    };
  }, [activa, envio]);
  return null;
}

/** Un único aviso, fuera de tarjetas y diálogos que puedan recortarlo. */
export function Actividad() {
  const mensaje = useSyncExternalStore(suscribir, mensajeActual, () => "");
  return mensaje
    ? createPortal(
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="pointer-events-none fixed top-20 right-4 z-[100] flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-lg sm:right-8"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="size-4 shrink-0 text-primary motion-safe:animate-spin"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="3"
              opacity="0.2"
            />
            <path
              d="M12 3a9 9 0 0 1 9 9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          {mensaje}
        </div>,
        document.body,
      )
    : null;
}

function EstadoEnlace() {
  const { pending } = useLinkStatus();
  return <CargaActiva activa={pending} />;
}

export function EnlaceConCarga({
  children,
  anticipar = false,
  ...props
}: ComponentProps<typeof NextLink> & { anticipar?: boolean }) {
  const [intencion, setIntencion] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelar = () => clearTimeout(espera.current);
  useEffect(() => () => clearTimeout(espera.current), []);
  return (
    <NextLink
      {...props}
      prefetch={anticipar ? intencion : props.prefetch}
      onMouseEnter={(evento) => {
        props.onMouseEnter?.(evento);
        if (anticipar && !intencion) {
          cancelar();
          espera.current = setTimeout(() => setIntencion(true), 150);
        }
      }}
      onMouseLeave={(evento) => {
        cancelar();
        props.onMouseLeave?.(evento);
      }}
      onFocus={(evento) => {
        props.onFocus?.(evento);
        if (anticipar) setIntencion(true);
      }}
    >
      {children}
      <EstadoEnlace />
    </NextLink>
  );
}

function EstadoFormulario() {
  const { pending } = useFormStatus();
  return <CargaActiva activa={pending} envio />;
}

export function FormularioConCarga({
  children,
  ...props
}: ComponentProps<"form">) {
  return (
    <form {...props}>
      <EstadoFormulario />
      {children}
    </form>
  );
}

export function FormularioBusqueda({
  children,
  ...props
}: ComponentProps<typeof NextForm>) {
  return (
    <NextForm {...props}>
      <EstadoFormulario />
      {children}
    </NextForm>
  );
}
