import type { Metadata } from "next";
import {
  EnlaceConCarga as Link,
  FormularioBusqueda,
} from "@/app/components/actividad";
import {
  claseBotonPrimario,
  claseBotonSecundario,
  Encabezado,
} from "@/app/components/formulario";
// Mismos estilos de urgencia y formato de fecha que el portal del profesor.
import { obtenerFormatoFecha, URGENCIA } from "@/app/profesor/datos";
import { OPCIONES_URGENCIA } from "@/app/profesor/situacion-opciones";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import {
  ESTADOS,
  ESTADOS_ABIERTOS,
  NOMBRE_ESTADO,
  obtenerBandeja,
  quienInformo,
  type Bandeja,
} from "../datos";
import { BotonTomar } from "./boton-tomar";

export const metadata: Metadata = { title: "Bandeja de situaciones" };

type Filtros = {
  estado?: string;
  urgencia?: string;
  /** mias: a cargo de quien consulta; sin: abiertas que nadie ha tomado. */
  responsable?: string;
  q?: string;
  pagina?: string;
};

const RESPONSABLES = [
  { valor: "mias", texto: "Mis situaciones" },
  { valor: "sin", texto: "Sin responsable" },
];

const CODIGO = /^[A-Z0-9-]{3,40}$/;

function enlace({ estado, urgencia, responsable, q, pagina }: Filtros) {
  const parametros = new URLSearchParams();
  if (estado) parametros.set("estado", estado);
  if (urgencia) parametros.set("urgencia", urgencia);
  if (responsable) parametros.set("responsable", responsable);
  if (q) parametros.set("q", q);
  if (pagina) parametros.set("pagina", pagina);
  const consulta = parametros.toString();
  return consulta
    ? `/convivencia/situaciones?${consulta}`
    : "/convivencia/situaciones";
}

// HU-037 CA4: cada total sale del conteo que la API leyó junto con la lista.
// El de un estado respeta la urgencia y el responsable elegidos, y viceversa.
function total(
  conteo: Bandeja["conteo"],
  { estado, urgencia, responsable }: Filtros,
) {
  return conteo
    .filter(
      (fila) =>
        (estado ? fila.estado === estado : fila.estado !== "DESCARTADA") &&
        (!urgencia ||
          (urgencia === "PRIORITARIA"
            ? ["URGENTE", "INMEDIATA"].includes(fila.urgencia) &&
              ESTADOS_ABIERTOS.includes(fila.estado)
            : fila.urgencia === urgencia)) &&
        (!responsable || fila.responsable === responsable),
    )
    .reduce((suma, fila) => suma + fila.total, 0);
}

// PB-044 (HU-037): bandeja de situaciones de la escuela con filtros por estado
// y por urgencia. La urgencia se muestra separada del estado. Con el filtro
// Responsable cada profesional ve las suyas (PB-046) y las que nadie ha
// tomado, y puede tomarlas desde aquí.
export default async function PaginaBandeja({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const q = typeof parametros.q === "string" ? parametros.q.slice(0, 120) : "";
  const paginaPedida =
    typeof parametros.pagina === "string" ? parametros.pagina : "1";
  const estado =
    typeof parametros.estado === "string" && NOMBRE_ESTADO[parametros.estado]
      ? parametros.estado
      : undefined;
  const urgencia =
    typeof parametros.urgencia === "string" &&
    (URGENCIA[parametros.urgencia] || parametros.urgencia === "PRIORITARIA")
      ? parametros.urgencia
      : undefined;
  const responsable = RESPONSABLES.find(
    (r) => r.valor === parametros.responsable,
  )?.valor;
  const tomada =
    typeof parametros.tomada === "string" && CODIGO.test(parametros.tomada)
      ? parametros.tomada
      : undefined;

  const [respuesta, formatearFecha] = await Promise.all([
    obtenerBandeja({ estado, urgencia, responsable, q, pagina: paginaPedida }),
    obtenerFormatoFecha(),
  ]);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/" />;
  const {
    situaciones,
    conteo,
    limite,
    pagina,
    total: cantidad,
  } = respuesta.datos;
  const paginas = Math.max(1, Math.ceil(cantidad / limite));
  // Después de tomar una situación se vuelve a esta misma página.
  const volver = enlace({
    estado,
    urgencia,
    responsable,
    q,
    pagina: pagina > 1 ? String(pagina) : undefined,
  });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4">
        <Encabezado
          titulo="Bandeja de situaciones"
          descripcion="Busca una situación para revisar sus antecedentes, la urgencia y el estado de su gestión se muestran por separado."
        />
        {/* PB-043: situaciones que llegan por otros canales. */}
        <Link
          href="/convivencia/registrar"
          className={`mb-6 ${claseBotonPrimario}`}
        >
          Registrar situación
        </Link>
      </div>

      {tomada && (
        <div
          role="status"
          className="mb-5 rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm"
        >
          Tomaste la situación {tomada}: quedaste como responsable de su
          revisión y ya aparece en{" "}
          <Link
            href={enlace({ responsable: "mias" })}
            className="font-medium underline underline-offset-2"
          >
            Mis situaciones
          </Link>
          .
        </div>
      )}

      <FormularioBusqueda
        action="/convivencia/situaciones"
        className="mb-5 flex flex-wrap items-end gap-3"
      >
        {estado && <input type="hidden" name="estado" value={estado} />}
        {urgencia && <input type="hidden" name="urgencia" value={urgencia} />}
        {responsable && (
          <input type="hidden" name="responsable" value={responsable} />
        )}
        <div className="min-w-56 flex-1">
          <label
            htmlFor="buscar-situacion"
            className="block text-sm font-medium"
          >
            Nombre o RUT del estudiante, o código de situación
          </label>
          <input
            id="buscar-situacion"
            type="search"
            name="q"
            defaultValue={q}
            maxLength={120}
            className="mt-1.5 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          />
        </div>
        <button className={claseBotonPrimario}>Buscar</button>
        <Link href="/convivencia/situaciones" className={claseBotonSecundario}>
          Limpiar
        </Link>
      </FormularioBusqueda>

      <div className="mb-6 space-y-3">
        <Filtro
          titulo="Responsable"
          opciones={[
            {
              texto: "Todas",
              href: enlace({ estado, urgencia, q }),
              activo: !responsable,
              total: total(conteo, { estado, urgencia }),
            },
            ...RESPONSABLES.map((r) => ({
              texto: r.texto,
              href: enlace({ estado, urgencia, responsable: r.valor, q }),
              activo: responsable === r.valor,
              total: total(conteo, { estado, urgencia, responsable: r.valor }),
            })),
          ]}
        />
        <Filtro
          titulo="Estado"
          opciones={[
            {
              texto: "Sin descartadas",
              href: enlace({ urgencia, responsable, q }),
              activo: !estado,
              total: total(conteo, { urgencia, responsable }),
            },
            ...ESTADOS.map((e) => ({
              texto: e.texto,
              href: enlace({ estado: e.valor, urgencia, responsable, q }),
              activo: estado === e.valor,
              total: total(conteo, { estado: e.valor, urgencia, responsable }),
            })),
          ]}
        />
        <Filtro
          titulo="Urgencia"
          opciones={[
            {
              texto: "Todas",
              href: enlace({ estado, responsable, q }),
              activo: !urgencia,
              total: total(conteo, { estado, responsable }),
            },
            ...[
              {
                valor: "PRIORITARIA",
                texto: "Urgentes e inmediatas por atender",
              },
              ...OPCIONES_URGENCIA,
            ].map((u) => ({
              texto: u.texto,
              href: enlace({ estado, urgencia: u.valor, responsable, q }),
              activo: urgencia === u.valor,
              total: total(conteo, { estado, urgencia: u.valor, responsable }),
            })),
          ]}
        />
      </div>

      {situaciones.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {responsable === "mias"
            ? "No tienes situaciones a tu cargo con estos filtros."
            : responsable === "sin"
              ? "No hay situaciones abiertas sin responsable con estos filtros."
              : "No hay situaciones con estos filtros."}
        </p>
      ) : (
        <ul className="space-y-3">
          {situaciones.map((situacion) => {
            const estiloUrgencia =
              URGENCIA[situacion.urgencia] ?? URGENCIA.NORMAL;
            // Una situación abierta que nadie revisa se puede tomar aquí.
            const tomable =
              !situacion.responsable_id &&
              ESTADOS_ABIERTOS.includes(situacion.estado);
            return (
              <li
                key={situacion.id}
                className="rounded-2xl border border-border bg-card shadow-tarjeta transition-colors has-[>a:hover]:border-primary/40"
              >
                <Link
                  href={`/convivencia/situaciones/${situacion.id}`}
                  anticipar
                  className="flex flex-col gap-3 rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-center"
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
                {tomable && (
                  <div className="border-t border-border px-5 py-3">
                    <BotonTomar
                      situacionId={situacion.id}
                      codigo={situacion.codigo}
                      volver={volver}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <nav
        aria-label="Páginas de situaciones"
        className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"
      >
        <p className="text-muted-foreground">
          {cantidad} {cantidad === 1 ? "situación" : "situaciones"}, hasta{" "}
          {limite} por página
        </p>
        <div className="flex items-center gap-3">
          {pagina > 1 && (
            <Link
              href={enlace({
                estado,
                urgencia,
                responsable,
                q,
                pagina: String(pagina - 1),
              })}
              className={claseBotonSecundario}
            >
              Anterior
            </Link>
          )}
          <span>
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link
              href={enlace({
                estado,
                urgencia,
                responsable,
                q,
                pagina: String(pagina + 1),
              })}
              className={claseBotonSecundario}
            >
              Siguiente
            </Link>
          )}
        </div>
      </nav>
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
                  opcion.activo
                    ? "bg-primary-foreground/20"
                    : "bg-muted text-muted-foreground"
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
