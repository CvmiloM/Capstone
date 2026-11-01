import Link from "next/link";
import { claseEnlace } from "@/app/components/formulario";
import { FormularioInvitacion } from "../usuarios/formulario-invitacion";
import { NOMBRE_ESTADO, NOMBRE_PERFIL } from "../usuarios/opciones";
import { BotonTerminarPaso } from "./boton-paso";
import type { Guia } from "./datos";

// PB-033 (HU-026): el equipo se invita desde la guía con el mismo formulario y
// la misma operación del portal (CA2): crea o reutiliza la ficha y deja la
// cuenta Pendiente con quién invitó y cuándo (CA1). Al aceptar, la cuenta se
// activa sin cambiar escuela ni perfil (CA4, PB-003).
export function PasoEquipo({
  guia,
  fecha,
  listo,
}: {
  guia: Guia;
  fecha: (iso: string) => string;
  listo: boolean;
}) {
  const { cuentas, total } = guia.equipo;

  return (
    <div className="space-y-6">
      <section aria-labelledby="titulo-invitar">
        <h3 id="titulo-invitar" className="text-base font-semibold">
          Invitar a una persona
        </h3>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Puedes invitar a varias personas seguidas. Cada una recibe un correo
          para activar su cuenta.
        </p>
        <FormularioInvitacion />
      </section>

      <section
        aria-labelledby="titulo-equipo"
        className="border-t border-border pt-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="titulo-equipo" className="text-base font-semibold">
            Equipo de Convivencia y profesores
          </h3>
          <Link href="/admin/usuarios" className={`text-sm ${claseEnlace}`}>
            Reenviar o suspender en Usuarios
          </Link>
        </div>
        {cuentas.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Todavía no hay cuentas de Convivencia ni de profesores.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {cuentas.map((cuenta) => (
              <li
                key={cuenta.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <span className="font-medium">{cuenta.nombre}</span>
                  <span className="block text-xs text-muted-foreground break-all">
                    {NOMBRE_PERFIL[cuenta.perfil] ?? cuenta.perfil}
                    {cuenta.correo ? ` · ${cuenta.correo}` : ""}
                    {cuenta.invitado_en
                      ? ` · invitada el ${fecha(cuenta.invitado_en)}`
                      : ""}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    cuenta.estado === "ACTIVO"
                      ? "bg-verde/15 text-tinta"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {NOMBRE_ESTADO[cuenta.estado] ?? cuenta.estado}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-border pt-5">
        <p className="mb-3 text-sm text-muted-foreground">
          {total === 0
            ? "Para marcar el paso como listo, invita al menos a una persona."
            : `Hay ${total.toLocaleString("es-CL")} ${total === 1 ? "cuenta" : "cuentas"} de Convivencia o profesores, invitadas o activas.`}
        </p>
        {!listo && (
          <BotonTerminarPaso
            paso="equipo"
            version={guia.version}
            habilitado={total > 0}
          />
        )}
      </section>
    </div>
  );
}
