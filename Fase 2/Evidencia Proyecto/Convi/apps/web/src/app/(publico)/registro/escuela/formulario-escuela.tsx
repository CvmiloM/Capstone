"use client";

import { useActionState, type ReactNode } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { crearEscuela, type EstadoEscuela } from "./acciones";
import { LARGO_MAXIMO_ESCUELA, REGIONES, ZONAS_HORARIAS } from "./opciones";

const estadoInicial: EstadoEscuela = {};

// Lista desplegable con el mismo estilo que Campo (components/formulario.tsx).
function Selector({
  name,
  etiqueta,
  ayuda,
  error,
  defaultValue,
  children,
}: {
  name: string;
  etiqueta: string;
  ayuda?: string;
  error?: string;
  defaultValue: string;
  children: ReactNode;
}) {
  const idDescripcion = error
    ? `${name}-error`
    : ayuda
      ? `${name}-ayuda`
      : undefined;

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={idDescripcion}
        className={`mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15 ${
          error ? "border-destructive" : "border-input"
        }`}
      >
        {children}
      </select>
      {error ? (
        <p id={idDescripcion} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p id={idDescripcion} className="mt-1.5 text-sm text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

export function FormularioEscuela() {
  const [estado, accion, pendiente] = useActionState(
    crearEscuela,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}

      <Campo
        name="nombre"
        etiqueta="Nombre del establecimiento"
        autoComplete="organization"
        required
        maxLength={LARGO_MAXIMO_ESCUELA.nombre}
        defaultValue={valores.nombre}
        error={errores.nombre}
      />
      <Campo
        name="codigo"
        etiqueta="Código institucional (opcional)"
        ayuda="Por ejemplo, el RBD. No puede repetirse con otra escuela."
        maxLength={LARGO_MAXIMO_ESCUELA.codigo}
        defaultValue={valores.codigo}
        error={errores.codigo}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Selector
          name="region"
          etiqueta="Región (opcional)"
          defaultValue={valores.region ?? ""}
          error={errores.region}
        >
          <option value="">Sin especificar</option>
          {REGIONES.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </Selector>
        <Campo
          name="comuna"
          etiqueta="Comuna (opcional)"
          maxLength={LARGO_MAXIMO_ESCUELA.comuna}
          defaultValue={valores.comuna}
          error={errores.comuna}
        />
      </div>
      <Campo
        name="direccion"
        etiqueta="Dirección (opcional)"
        autoComplete="street-address"
        maxLength={LARGO_MAXIMO_ESCUELA.direccion}
        defaultValue={valores.direccion}
        error={errores.direccion}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="telefono_escuela"
          etiqueta="Teléfono (opcional)"
          type="tel"
          placeholder="+56 41 234 5678"
          maxLength={LARGO_MAXIMO_ESCUELA.telefono_escuela}
          defaultValue={valores.telefono_escuela}
          error={errores.telefono_escuela}
        />
        <Campo
          name="correo_contacto"
          etiqueta="Correo de contacto (opcional)"
          type="email"
          maxLength={LARGO_MAXIMO_ESCUELA.correo_contacto}
          defaultValue={valores.correo_contacto}
          error={errores.correo_contacto}
        />
      </div>
      <Selector
        name="zona_horaria"
        etiqueta="Zona horaria"
        ayuda="Se usa para las fechas y horas de los registros."
        defaultValue={valores.zona_horaria || "America/Santiago"}
        error={errores.zona_horaria}
      >
        {ZONAS_HORARIAS.map((zona) => (
          <option key={zona.valor} value={zona.valor}>
            {zona.texto}
          </option>
        ))}
      </Selector>

      <BotonEnviar pendiente={pendiente} textoPendiente="Creando establecimiento…">
        Crear establecimiento
      </BotonEnviar>
    </form>
  );
}