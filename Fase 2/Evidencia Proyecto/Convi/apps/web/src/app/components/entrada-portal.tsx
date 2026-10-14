import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { consultarCuentaActiva } from "@/lib/supabase/cuenta";
import { Encabezado, AvisoError, claseBotonSecundario } from "./formulario";
import { MarcaCompacta } from "./marca";
import { BotonCerrarSesion } from "./boton-cerrar-sesion";

// Entrada mínima de estos perfiles; sus funciones se incorporan en sus propios backlogs.
export async function EntradaPortal({
  perfil,
}: {
  perfil: "CONVIVENCIA" | "APODERADO";
}) {
  await connection();
  const consulta = await consultarCuentaActiva(await crearClienteServidor());
  if (consulta.estado === "sin-sesion" || consulta.estado === "bloqueada")
    redirect("/login");
  if (consulta.estado === "sin-conexion") {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-12">
        <AvisoError>
          No pudimos comprobar tu acceso. Inténtalo nuevamente en unos minutos.
        </AvisoError>
      </main>
    );
  }
  if (consulta.cuenta.codigo_perfil !== perfil) redirect("/");
  if (consulta.cuenta.segundo_factor_pendiente)
    redirect("/verificar-segundo-factor");
  const nombre = perfil === "CONVIVENCIA" ? "Convivencia" : "Apoderado";

  return (
    <main className="relative isolate flex flex-1 items-center justify-center px-4 py-12">
      <div
        aria-hidden="true"
        className="fondo-cuaderno absolute inset-0 -z-10"
      />
      <section className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-tarjeta">
        <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-5 sm:px-8">
          <Link
            href="/"
            aria-label="CONVI, ir al inicio"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          >
            <MarcaCompacta />
          </Link>
          <span className="rounded bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground">
            {nombre}
          </span>
        </header>
        <div className="p-6 sm:p-8">
          <Encabezado
            titulo={`Portal de ${nombre}`}
            descripcion="Tu acceso a este espacio está habilitado."
          />
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Las secciones de este portal estarán disponibles próximamente.
          </p>
          <div className="mt-6 flex flex-wrap items-start gap-3">
            <Link href="/" className={claseBotonSecundario}>
              Volver al inicio
            </Link>
            <BotonCerrarSesion />
          </div>
        </div>
      </section>
    </main>
  );
}
