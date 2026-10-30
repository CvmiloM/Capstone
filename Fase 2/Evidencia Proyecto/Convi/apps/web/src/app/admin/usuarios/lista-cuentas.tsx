"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AvatarUsuario } from "@/app/components/avatar-usuario";
import type { CuentaEscuela } from "./datos";
import { NOMBRE_ESTADO, NOMBRE_PERFIL } from "./opciones";
import { BotonReenvio } from "./boton-reenvio";
import { BotonSuspension } from "./boton-suspension";
import { FormularioReactivacion } from "./formulario-reactivacion";
import { FormularioRestablecimiento } from "./formulario-restablecimiento";

const CLASE_ESTADO: Record<string, string> = {
  PENDIENTE: "bg-naranjo text-tinta",
  ACTIVO: "bg-primary text-primary-foreground",
  SUSPENDIDO: "bg-muted text-muted-foreground",
  REVOCADO: "bg-destructive/10 text-destructive",
};

function SelectorPerfil({
  valor,
  cambiar,
}: {
  valor: string;
  cambiar: (valor: string) => void;
}) {
  const desplegable = useRef<HTMLDetailsElement>(null);
  const opciones = [
    ["", "Todos los perfiles"],
    ...Object.entries(NOMBRE_PERFIL),
  ];

  useEffect(() => {
    function cerrarFuera(evento: PointerEvent) {
      if (
        desplegable.current &&
        !desplegable.current.contains(evento.target as Node)
      )
        desplegable.current.open = false;
    }
    document.addEventListener("pointerdown", cerrarFuera);
    return () => document.removeEventListener("pointerdown", cerrarFuera);
  }, []);

  function teclado(evento: KeyboardEvent<HTMLDetailsElement>) {
    const elemento = desplegable.current;
    if (!elemento) return;
    if (evento.key === "Escape") {
      evento.preventDefault();
      elemento.open = false;
      elemento.querySelector("summary")?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    elemento.open = true;
    const botones = Array.from(
      elemento.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    );
    const actual = botones.indexOf(document.activeElement as HTMLButtonElement);
    const siguiente =
      evento.key === "Home"
        ? 0
        : evento.key === "End"
          ? botones.length - 1
          : evento.key === "ArrowDown"
            ? (actual + 1) % botones.length
            : actual < 0
              ? botones.length - 1
              : (actual - 1 + botones.length) % botones.length;
    botones[siguiente]?.focus();
  }

  return (
    <div>
      <span id="etiqueta-perfil" className="mb-1.5 block text-sm font-medium">
        Perfil
      </span>
      <details
        ref={desplegable}
        className="relative w-52"
        onKeyDown={teclado}
        onBlur={(evento) => {
          if (
            !evento.currentTarget.contains(evento.relatedTarget as Node | null)
          )
            evento.currentTarget.open = false;
        }}
      >
        <summary
          id="filtro-perfil"
          aria-haspopup="menu"
          aria-labelledby="etiqueta-perfil valor-perfil"
          className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
        >
          <span id="valor-perfil">
            {NOMBRE_PERFIL[valor] ?? "Todos los perfiles"}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            ⌄
          </span>
        </summary>
        <div
          role="menu"
          aria-labelledby="etiqueta-perfil"
          className="absolute left-0 top-full z-50 mt-2 w-full rounded-2xl border border-border bg-card p-1.5 shadow-tarjeta"
        >
          {opciones.map(([opcion, nombre]) => (
            <button
              key={opcion}
              type="button"
              role="menuitemradio"
              aria-checked={valor === opcion}
              tabIndex={-1}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm presion hover:bg-muted focus:bg-muted focus:outline-none ${valor === opcion ? "bg-accent font-medium text-accent-foreground" : "text-foreground"}`}
              onClick={() => {
                cambiar(opcion);
                if (desplegable.current) {
                  desplegable.current.open = false;
                  desplegable.current.querySelector("summary")?.focus();
                }
              }}
            >
              {nombre}
              <span aria-hidden="true">{valor === opcion ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function FechaCuenta({
  texto,
  fecha,
  zonaHoraria,
}: {
  texto: string;
  fecha: string | null;
  zonaHoraria: string;
}) {
  if (!fecha) return null;
  const formatoFecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: zonaHoraria });
  return (
    <p>
      {texto}{" "}
      <time dateTime={fecha}>{formatoFecha.format(new Date(fecha))}</time>
    </p>
  );
}

export function ListaCuentas({
  cuentas,
  solicitudes,
  reenvios,
  zonaHoraria,
  perfilInicial,
  suspendidasInicial,
}: {
  cuentas: CuentaEscuela[];
  solicitudes: Record<string, string>;
  /** PB-146: clave de reenvío por cada cuenta pendiente. */
  reenvios: Record<string, string>;
  zonaHoraria: string;
  perfilInicial: string;
  suspendidasInicial: boolean;
}) {
  const [perfil, setPerfil] = useState(perfilInicial);
  const [suspendidas, setSuspendidas] = useState(suspendidasInicial);
  const visibles = cuentas.filter(
    (c) =>
      (!perfil || c.perfil === perfil) &&
      (suspendidas || c.estado !== "SUSPENDIDO"),
  );
  const pendientes = visibles.filter((c) => c.estado === "PENDIENTE").length;
  const filtros = { perfil, suspendidas };

  return (
    <section aria-labelledby="titulo-cuentas" className="lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <SelectorPerfil valor={perfil} cambiar={setPerfil} />
        <label className="flex cursor-pointer items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            checked={suspendidas}
            onChange={(e) => setSuspendidas(e.target.checked)}
            className="size-4 accent-primary"
          />
          Mostrar cuentas suspendidas
        </label>
      </div>

      <h2
        id="titulo-cuentas"
        className="mb-3 text-sm text-muted-foreground"
        aria-live="polite"
      >
        {visibles.length} {visibles.length === 1 ? "cuenta" : "cuentas"}
        {pendientes > 0 &&
          ` · ${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"} de activar`}
      </h2>
      {visibles.length === 0 && (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          No hay cuentas que coincidan con estos filtros
        </p>
      )}
      <ul className="space-y-3">
        {visibles.map((cuenta) => {
          const nombre = `${cuenta.nombres} ${cuenta.apellidos}`;
          return (
            <li key={cuenta.id}>
              <details className="group rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <AvatarUsuario correo={cuenta.correo} tamano={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{nombre}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {cuenta.correo}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                      {NOMBRE_PERFIL[cuenta.perfil] ?? cuenta.perfil}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASE_ESTADO[cuenta.estado] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {NOMBRE_ESTADO[cuenta.estado] ?? cuenta.estado}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground transition-transform group-open:rotate-180"
                  >
                    ⌄
                  </span>
                </summary>
                <div className="mt-4 space-y-3 border-t border-border pt-3">
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {cuenta.estado === "PENDIENTE" && (
                      <>
                        <FechaCuenta
                      zonaHoraria={zonaHoraria}
                          texto="Invitada el"
                          fecha={cuenta.invitado_en}
                        />
                        {cuenta.invitado_por && (
                          <p>Invitada por {cuenta.invitado_por}</p>
                        )}
                      </>
                    )}
                    <FechaCuenta
                      zonaHoraria={zonaHoraria}
                      texto="Se activó el"
                      fecha={cuenta.activado_en}
                    />
                    <FechaCuenta
                      zonaHoraria={zonaHoraria}
                      texto="Suspendida el"
                      fecha={cuenta.suspendido_en}
                    />
                    <FechaCuenta
                      zonaHoraria={zonaHoraria}
                      texto="Reactivada el"
                      fecha={cuenta.reactivado_en}
                    />
                  </div>
                  {cuenta.es_propia && (
                    <p className="text-xs text-muted-foreground">Tu cuenta</p>
                  )}
                  {cuenta.estado === "PENDIENTE" && reenvios[cuenta.id] && (
                    <BotonReenvio
                      cuentaId={cuenta.id}
                      solicitudId={reenvios[cuenta.id]}
                    />
                  )}
                  {cuenta.estado === "ACTIVO" && !cuenta.es_propia && (
                    <BotonSuspension
                      cuentaId={cuenta.id}
                      nombre={nombre}
                      perfil={cuenta.perfil}
                      filtros={filtros}
                    />
                  )}
                  {cuenta.estado === "SUSPENDIDO" && (
                    <FormularioReactivacion
                      cuentaId={cuenta.id}
                      nombre={nombre}
                      filtros={filtros}
                    />
                  )}
                  {solicitudes[cuenta.id] && (
                    <FormularioRestablecimiento cuentaId={cuenta.id} solicitudId={solicitudes[cuenta.id]} nombre={nombre} filtros={filtros} />
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
