import type { Metadata } from "next";
import Link from "next/link";
import { claseBotonPrimario, Encabezado } from "@/app/components/formulario";
// Mismos estilos de urgencia y formato de fecha que el portal del profesor.
import { obtenerFormatoFecha, URGENCIA } from "@/app/profesor/datos";
import { OPCIONES_URGENCIA } from "@/app/profesor/situacion-opciones";
import { AvisoNoDisponible } from "./aviso-no-disponible";
import {
  ESTADOS,
  ESTADOS_ABIERTOS,
  NOMBRE_ESTADO,
  obtenerBandeja,
  quienInformo,
  type Bandeja,
} from "./datos";

export const metadata: Metadata = { title: "Bandeja de situaciones" };

type Filtros = { estado?: string; urgencia?: string };

function enlace({ estado, urgencia }: Filtros) {
  const parametros = new URLSearchParams();
  if (estado) parametros.set("estado", estado);
  if (urgencia) parametros.set("urgencia", urgencia);
  const consulta = parametros.toString();
  return consulta ? `/convivencia?${consulta}` : "/convivencia";
}

// HU-037 CA4: cada total sale del conteo que la API leyó junto con la lista.
// El de un estado respeta la urgencia elegida y viceversa.
function total(conteo: Bandeja["conteo"], { estado, urgencia }: Filtros) {
  return conteo
    .filter(
      (fila) =>
        (!estado || fila.estado === estado) &&
        (!urgencia || fila.urgencia === urgencia),
    )
    .reduce((suma, fila) => suma + fila.total, 0);
}

// PB-044 (HU-037): bandeja de situaciones de la escuela con filtros por estado
// y por urgencia. La urgencia se muestra separada del estado.
export default async function PaginaBandeja({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string | string[]; urgencia?: string | string[] }>;
}) {
  const parametros = await searchParams;
  const estado =
    typeof parametros.estado === "string" && NOMBRE_ESTADO[parametros.estado]
      ? parametros.estado
      : undefined;
  const urgencia =
    typeof parametros.urgencia === "string" && URGENCIA[parametros.urgencia]
      ? parametros.urgencia
      : undefined;

  const [respuesta, formatearFecha] = await Promise.all([obtenerBandeja({ estado, urgencia }), obtenerFormatoFecha()]);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/" />;
  const { situaciones, conteo, limite } = respuesta.datos;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4">
        <Encabezado
          titulo="Bandeja de situaciones"
          descripcion="Todas las situaciones registradas en tu escuela, la más urgente primero. Abre una para revisarla."
        />
        {/* PB-043: situaciones que llegan por otros canales. */}
        <Link
          href="/convivencia/registrar"
          className={`mb-6 ${claseBotonPrimario}`}
        >
          Registrar situación
        </Link>
      </div>

      <div className="mb-6 space-y-3">
        <Filtro
          titulo="Estado"
          opciones={[
            {
              texto: "Todos",
              href: enlace({ urgencia }),
              activo: !estado,
              total: total(conteo, { urgencia }),
            },
            ...ESTADOS.map((e) => ({
              texto: e.texto,
              href: enlace({ estado: e.valor, urgencia }),
              activo: estado === e.valor,
              total: total(conteo, { estado: e.valor, urgencia }),
            })),
          ]}
        />
        <Filtro
          titulo="Urgencia"
          opciones={[
            {
              texto: "Todas",
              href: enlace({ estado }),
              activo: !urgencia,
              total: total(conteo, { estado }),
            },
            ...OPCIONES_URGENCIA.map((u) => ({
              texto: u.texto,
              href: enlace({ estado, urgencia: u.valor }),
              activo: urgencia === u.valor,
              total: total(conteo, { estado, urgencia: u.valor }),
            })),
          ]}
        />
      </div>

      {situaciones.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No hay situaciones con estos filtros.
        </p>
      ) : (
        <ul className="space-y-3">
          {situaciones.map((situacion) => {
            const estiloUrgencia = URGENCIA[situacion.urgencia] ?? URGENCIA.NORMAL;
            return (
              <li key={situacion.id}>
                <Link
                  href={`/convivencia/situaciones/${situacion.id}`}
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
                      {[
                        situacion.curso,
                        quienInformo(situacion)
                          ? `Informó: ${quienInformo(situacion)}`
                          : null,
                        `Registró ${situacion.reportado_por}`,
                        `Ocurrió el ${formatearFecha(situacion.ocurrido_en)}`,
                        // PB-046 (HU-039): para repartir el trabajo se ve quién revisa cada una.
                        situacion.responsable
                          ? `Responsable: ${situacion.responsable}`
                          : ESTADOS_ABIERTOS.includes(situacion.estado)
                            ? "Sin responsable"
                            : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      {situacion.estudiantes === 1
                        ? "1 estudiante"
                        : `${situacion.estudiantes} estudiantes`}
                    </span>
                    {situacion.aclaraciones_pendientes > 0 && (
                      <span className="rounded-full bg-naranjo px-2.5 py-0.5 text-xs font-semibold text-tinta">
                        Esperando aclaración
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${estiloUrgencia.clase}`}
                    >
                      {estiloUrgencia.texto}
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
      {situaciones.length >= limite && (
        <p className="mt-4 text-sm text-muted-foreground">
          Se muestran las {limite} más urgentes y recientes. Usa los filtros para
          ver el resto.
        </p>
      )}
    </>
  );
}

function Filtro({
  titulo,
  opciones,
}: {
  titulo: string;
  opciones: { texto: string; href: string; activo: boolean; total: number }[];
}) {
  return (
    <nav aria-label={`Filtrar por ${titulo.toLowerCase()}`}>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {opciones.map((opcion) => (
          <li key={opcion.texto}>
            <Link
              href={opcion.href}
              aria-current={opcion.activo ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                opcion.activo
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {opcion.texto}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  opcion.activo ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
                }`}
              >
                {opcion.total}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
