import type { Metadata } from "next";
import { Encabezado } from "@/app/components/formulario";
import { obtenerCuentas, type CuentaEscuela } from "./datos";
import { FormularioInvitacion } from "./formulario-invitacion";
import { NOMBRE_ESTADO, NOMBRE_PERFIL } from "./opciones";
import { BotonReenvio } from "./boton-reenvio";

export const metadata: Metadata = { title: "Usuarios" };

const CLASE_ESTADO: Record<string, string> = {
  PENDIENTE: "bg-naranjo text-tinta",
  ACTIVO: "bg-primary text-primary-foreground",
  SUSPENDIDO: "bg-muted text-muted-foreground",
  REVOCADO: "bg-destructive/10 text-destructive",
};

// TODO(HU-021): usar la zona horaria de la escuela cuando la API la entregue.
const formatoFecha = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Santiago",
});

function detalle(cuenta: CuentaEscuela) {
  if (cuenta.estado === "PENDIENTE" && cuenta.invitado_en) {
    return `Invitada el ${formatoFecha.format(new Date(cuenta.invitado_en))}${
      cuenta.invitado_por ? ` por ${cuenta.invitado_por}` : ""
    }`;
  }
  if (cuenta.activado_en) {
    return `Activa desde el ${formatoFecha.format(new Date(cuenta.activado_en))}`;
  }
  return null;
}

// PB-010 (HU-009): cuentas de la escuela e invitación de nuevas cuentas.
export default async function PaginaUsuarios() {
  const cuentas = await obtenerCuentas();
  const pendientes = cuentas.filter((c) => c.estado === "PENDIENTE").length;

  return (
    <>
      <Encabezado
        titulo="Usuarios"
        descripcion="Las cuentas de tu escuela. Invita a profesores y al equipo de Convivencia: cada persona recibe un correo para activar su cuenta y definir su contraseña."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="titulo-cuentas" className="lg:col-span-2">
          <h2
            id="titulo-cuentas"
            className="mb-3 text-sm text-muted-foreground"
          >
            {cuentas.length} {cuentas.length === 1 ? "cuenta" : "cuentas"}
            {pendientes > 0 &&
              ` · ${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"} de activar`}
          </h2>
          <ul className="space-y-3">
            {cuentas.map((cuenta) => {
              const texto = detalle(cuenta);
              return (
                <li
                  key={cuenta.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-tarjeta sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {cuenta.apellidos}, {cuenta.nombres}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {cuenta.correo}
                    </p>
                    {texto && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {texto}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                      {NOMBRE_PERFIL[cuenta.perfil] ?? cuenta.perfil}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        CLASE_ESTADO[cuenta.estado] ??
                        "bg-muted text-muted-foreground"
                      }`}
                    >
                      {NOMBRE_ESTADO[cuenta.estado] ?? cuenta.estado}
                    </span>
                  </div>
                  {cuenta.estado === "PENDIENTE" && (
                    <BotonReenvio cuentaId={cuenta.id} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section
          aria-labelledby="titulo-invitar"
          className="h-fit rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
        >
          <h2 id="titulo-invitar" className="mb-4 text-base font-semibold">
            Invitar una cuenta
          </h2>
          <FormularioInvitacion />
        </section>
      </div>
    </>
  );
}
