import type { Metadata } from "next";
import Link from "next/link";
import { claseBotonPrimario, Encabezado } from "@/app/components/formulario";
import { AvisoSinPermiso } from "../aviso-sin-permiso";
import {
  obtenerFormatoFecha,
  NOMBRE_ESTADO,
  obtenerSituaciones,
  URGENCIA,
} from "../datos";

export const metadata: Metadata = { title: "Mis registros" };

// HU-034 CA2: las situaciones que registró el profesor, la más reciente primero.
export default async function PaginaMisRegistros() {
  const [respuesta, formatearFecha] = await Promise.all([obtenerSituaciones(), obtenerFormatoFecha()]);
  if (!respuesta.ok) return <AvisoSinPermiso volverA="/profesor" />;
  const situaciones = respuesta.datos;

  return (
    <>
            <div className="flex flex-wrap items-start justify-between gap-x-4">
        <Encabezado
          titulo="Mis registros"
          descripcion="Las situaciones que registraste y en qué estado están. Abre una para ver su detalle y las aclaraciones que te pidió Convivencia."
        />
        {/* Una situación pertenece a un curso: primero se elige el curso. */}
        <Link href="/profesor" className={`mb-6 ${claseBotonPrimario}`}>
          Registrar situación
        </Link>
      </div>

      {situaciones.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                    Todavía no has registrado situaciones. Para registrar una, elige
          uno de tus cursos.
        </p>
      ) : (
        <ul className="space-y-3">
          {situaciones.map((situacion) => {
            const urgencia = URGENCIA[situacion.urgencia] ?? URGENCIA.NORMAL;
            return (
              <li key={situacion.id}>
                <Link
                  href={`/profesor/situaciones/${situacion.id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-muted-foreground">
                      {situacion.codigo}
                    </p>
                    <p className="mt-1 font-semibold">
                      {situacion.categoria ?? "Sin categoría"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[situacion.curso, `Ocurrió el ${formatearFecha(situacion.ocurrido_en)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    {situacion.aclaraciones_pendientes > 0 && (
                      <span className="rounded-full bg-naranjo px-2.5 py-0.5 text-xs font-semibold text-tinta">
                        {situacion.aclaraciones_pendientes === 1
                          ? "1 aclaración pendiente"
                          : `${situacion.aclaraciones_pendientes} aclaraciones pendientes`}
                      </span>
                    )}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencia.clase}`}>
                      {urgencia.texto}
                    </span>
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                      {NOMBRE_ESTADO[situacion.estado] ?? situacion.estado}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}