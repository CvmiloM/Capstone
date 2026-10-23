"use client";

import { useActionState, useRef, useState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";
import { guardarFichaInstitucional, type EstadoFicha } from "./acciones";
import type { FichaInstitucional } from "./datos";

const inicial: EstadoFicha = {};

export function FormularioFicha({ ficha }: { ficha: FichaInstitucional }) {
  const [rbdEditable, setRbdEditable] = useState(false);
  const [confirmarRbd, setConfirmarRbd] = useState(false);
  const botonCandado = useRef<HTMLButtonElement>(null);
  const [estado, accion, pendiente] = useActionState(
    guardarFichaInstitucional,
    inicial,
    "/admin/establecimiento",
  );
  const valores = estado.valores ?? ficha;
  const errores = estado.errores ?? {};
  return (
    <form
      action={accion}
      noValidate
      onReset={(evento) => evento.preventDefault()}
      className="space-y-6"
    >
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <input
        type="hidden"
        name="actualizado_en"
        value={estado.valores?.actualizado_en ?? ficha.actualizado_en}
      />
      <fieldset disabled={pendiente} className="space-y-5 disabled:opacity-70">
        <legend className="mb-4 text-base font-semibold">
          Datos institucionales
        </legend>
        <Campo
          name="codigo"
          etiqueta="RBD del establecimiento"
          ayuda="Rol Base de Datos asignado por Mineduc, escribe solo el número, sin puntos, guion ni dígito verificador, ejemplos de formato: 8485 o 12345"
          placeholder="Ejemplo: 8485"
          inputMode="numeric"
          maxLength={40}
          readOnly={!rbdEditable}
          className={rbdEditable ? "" : "opacity-75"}
          defaultValue={valores.codigo ?? ""}
          error={errores.codigo}
          accesorio={
            <button
              ref={botonCandado}
              type="button"
              disabled={rbdEditable}
              aria-label={
                rbdEditable
                  ? "RBD desbloqueado para esta edición"
                  : "Desbloquear edición del RBD"
              }
              aria-expanded={confirmarRbd}
              aria-controls="confirmar-rbd"
              onClick={() => setConfirmarRbd(!confirmarRbd)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              title={rbdEditable ? "RBD desbloqueado" : "Desbloquear RBD"}
            >
              <Icono nombre="candado" className="size-4" />
            </button>
          }
        />
        <p className="text-sm text-muted-foreground">
          Usa el RBD oficial de tu escuela, no inventes uno ni copies los
          ejemplos, si aún no tiene uno asignado puedes dejarlo vacío
        </p>
        {confirmarRbd && (
          <div
            id="confirmar-rbd"
            role="group"
            aria-labelledby="titulo-confirmar-rbd"
            className="rounded-xl border border-border bg-muted/50 p-4"
          >
            <p id="titulo-confirmar-rbd" className="text-sm font-semibold">
              ¿Seguro que quieres cambiar el RBD?
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Identifica oficialmente a tu establecimiento ante Mineduc,
              habilita la edición solo si necesitas corregirlo
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => {
                  setRbdEditable(true);
                  setConfirmarRbd(false);
                  document.getElementById("codigo")?.focus();
                }}
              >
                Sí, habilitar edición
              </button>
              <button
                type="button"
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => {
                  setConfirmarRbd(false);
                  botonCandado.current?.focus();
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {rbdEditable && (
          <p role="status" className="text-sm text-muted-foreground">
            RBD desbloqueado, la modificación se aplicará al guardar los cambios
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo
            name="region"
            etiqueta="Región"
            maxLength={100}
            autoComplete="address-level1"
            defaultValue={valores.region ?? ""}
            error={errores.region}
          />
          <Campo
            name="comuna"
            etiqueta="Comuna"
            maxLength={100}
            autoComplete="address-level2"
            defaultValue={valores.comuna ?? ""}
            error={errores.comuna}
          />
        </div>
        <Campo
          name="direccion"
          etiqueta="Dirección"
          maxLength={200}
          autoComplete="street-address"
          defaultValue={valores.direccion ?? ""}
          error={errores.direccion}
        />
      </fieldset>
      <fieldset
        disabled={pendiente}
        className="space-y-5 border-t border-border pt-5 disabled:opacity-70"
      >
        <legend className="mb-4 pt-5 text-base font-semibold">
          Contacto de la escuela
        </legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo
            name="telefono"
            etiqueta="Teléfono"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            defaultValue={valores.telefono ?? ""}
            error={errores.telefono}
          />
          <Campo
            name="correo_contacto"
            etiqueta="Correo de contacto"
            type="email"
            autoComplete="email"
            maxLength={180}
            defaultValue={valores.correo_contacto ?? ""}
            error={errores.correo_contacto}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Este correo es un dato de contacto, no crea una cuenta ni cambia el
          remitente de los correos de CONVI
        </p>
      </fieldset>
      <div className="flex justify-end border-t border-border pt-5">
        <div className="w-full sm:w-auto">
          <BotonEnviar
            pendiente={pendiente}
            textoPendiente="Guardando cambios…"
          >
            Guardar cambios
          </BotonEnviar>
        </div>
      </div>
    </form>
  );
}
