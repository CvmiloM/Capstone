import type { Metadata } from "next";
import { Encabezado } from "@/app/components/formulario";
import { obtenerContextoAdmin } from "../datos";
import { obtenerCuentas } from "./datos";
import { FormularioInvitacion } from "./formulario-invitacion";
import { ListaCuentas } from "./lista-cuentas";
import { NOMBRE_PERFIL } from "./opciones";

export const metadata: Metadata = { title: "Usuarios" };

export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: Promise<{
    suspension?: string;
    reactivacion?: string;
    perfil?: string;
    suspendidas?: string;
  }>;
}) {
  const [cuentas, contexto] = await Promise.all([obtenerCuentas(), obtenerContextoAdmin()]);
  const parametros = await searchParams;
  const perfil =
    typeof parametros.perfil === "string" &&
    Object.hasOwn(NOMBRE_PERFIL, parametros.perfil)
      ? parametros.perfil
      : "";
  const aviso =
    parametros.suspension === "realizada"
      ? "Cuenta suspendida, sus registros históricos se conservaron"
      : parametros.reactivacion === "realizada"
        ? "Cuenta reactivada, recuperó su acceso con el mismo correo y contraseña"
        : null;

  return (
    <>
      <Encabezado
        titulo="Usuarios"
        descripcion="Las cuentas de tu escuela, invita a profesores y al equipo de Convivencia: cada persona recibe un correo para activar su cuenta y definir su contraseña"
      />
      {aviso && (
        <p role="status" className="mb-6 rounded-lg bg-primary/10 p-3 text-sm">
          {aviso}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <ListaCuentas
          cuentas={cuentas}
          zonaHoraria={contexto.escuela.zonaHoraria}
          perfilInicial={perfil}
          suspendidasInicial={parametros.suspendidas === "1"}
        />
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
