import { redirect } from "next/navigation";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Icono, type NombreIcono } from "@/app/components/icono";
import {
  Encabezado,
  claseBotonPrimario,
  claseEnlace,
} from "@/app/components/formulario";
import { pedir } from "./datos";
import { AvisoNoDisponible } from "./aviso-no-disponible";
import { enlaceOrigen, nombreTipo, type Evento } from "./calendario/eventos";
import {
  Prioridades,
  AvancePreventivo,
  type PrioridadJornada,
  type PlanJornada,
} from "./jornada";

type Jornada = {
  hoy: string;
  zona_horaria: string;
  nuevas: number;
  urgentes: number;
  seguimientos: number;
  agenda_total: number;
  prioridades: PrioridadJornada[];
  agenda: Evento[];
  planes: PlanJornada[];
};
export const metadata = { title: "Tu jornada" };
const panel = "rounded-2xl border border-border bg-card p-5 sm:p-6";

export default async function Inicio({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  // Conserva los marcadores antiguos que abrían la bandeja con filtros.
  if (
    ["estado", "urgencia", "q", "pagina"].some((k) => typeof p[k] === "string")
  ) {
    const q = new URLSearchParams();
    for (const k of ["estado", "urgencia", "q", "pagina"])
      if (typeof p[k] === "string") q.set(k, p[k]);
    redirect(`/convivencia/situaciones?${q}`);
  }
  const r = await pedir<Jornada>("/convivencia/jornada");
  if (!r.ok) return <AvisoNoDisponible volverA="/" />;
  const d = r.datos;
  const fecha = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${d.hoy}T12:00:00Z`));
  const tarjetas: {
    titulo: string;
    valor: number;
    ayuda: string;
    href: string;
    icono: NombreIcono;
  }[] = [
    {
      titulo: "Situaciones nuevas",
      valor: d.nuevas,
      ayuda: "Esperan su primera revisión",
      href: "/convivencia/situaciones?estado=NUEVA",
      icono: "documentos",
    },
    {
      titulo: "Situaciones urgentes",
      valor: d.urgentes,
      ayuda: "Urgentes e inmediatas sin decisión final",
      href: "/convivencia/situaciones?urgencia=PRIORITARIA",
      icono: "alerta",
    },
    {
      titulo: "Seguimientos por realizar",
      valor: d.seguimientos,
      ayuda: "Programados hasta hoy y aún pendientes",
      href: "/convivencia/jornada/seguimientos",
      icono: "escudo",
    },
    {
      titulo: "Agenda de hoy",
      valor: d.agenda_total,
      ayuda: "Compromisos y actividades pendientes",
      href: `/convivencia/calendario?dia=${d.hoy}`,
      icono: "anios",
    },
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Encabezado
          titulo="Tu jornada"
          descripcion="Prioridades y gestiones de convivencia para hoy, en tu escuela."
        />
        <Link href="/convivencia/registrar" className={claseBotonPrimario}>
          Registrar situación
        </Link>
      </div>
      <p className="-mt-4 text-sm first-letter:uppercase text-muted-foreground">
        <time dateTime={d.hoy}>{fecha}</time>
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((t) => (
          <Link
            key={t.titulo}
            href={t.href}
            className={`${panel} group flex items-start gap-4 transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring`}
          >
            <span className="rounded-xl bg-accent p-2.5 text-primary">
              <Icono nombre={t.icono} className="size-6" />
            </span>
            <div>
              <p className="text-sm font-medium">{t.titulo}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {t.valor}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t.ayuda}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,1fr)]">
        <section className={panel}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-2xl font-semibold">
              Requiere atención
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Registros con una gestión pendiente y acceso a su contexto.
          </p>
          <Prioridades filas={d.prioridades} />
        </section>
        <section className={panel}>
          <h2 className="font-serif text-2xl font-semibold">
            Acciones rápidas
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Elige el registro antes de continuar con la gestión.
          </p>
          <div className="mt-5 grid gap-3">
            {[
              [
                "Revisar una situación",
                "/convivencia/situaciones?estado=NUEVA",
              ],
              [
                "Elegir caso para una intervención",
                "/convivencia/casos?para=intervencion",
              ],
              [
                "Elegir caso para un seguimiento",
                "/convivencia/casos?para=seguimiento",
              ],
              [
                "Elegir caso para adjuntar evidencia",
                "/convivencia/casos?para=evidencia",
              ],
            ].map(([titulo, href]) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                {titulo}
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
        <section className={panel}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl font-semibold">Agenda de hoy</h2>
            <Link
              href={`/convivencia/calendario?dia=${d.hoy}`}
              className={`text-sm ${claseEnlace}`}
            >
              Ver calendario
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Fechas programadas, los registros realizados o cancelados quedan
            fuera.
          </p>
          {d.agenda.length ? (
            <ul className="mt-4 divide-y divide-border">
              {d.agenda.map((e) => (
                <li key={`${e.tipo}-${e.origen_id}`}>
                  <Link
                    href={enlaceOrigen(e) ?? "/convivencia/calendario"}
                    className="flex items-start gap-4 rounded-lg py-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <time className="shrink-0 rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums">
                      {e.hora}
                    </time>
                    <div>
                      <p className="text-sm font-medium">{e.titulo}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {nombreTipo(e)}
                        {e.caso_codigo && ` · ${e.caso_codigo}`}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              No hay actividades pendientes programadas para hoy.
            </p>
          )}
          {d.agenda_total > 8 && (
            <p className="text-xs text-muted-foreground">
              Se muestran las primeras ocho, el calendario conserva las{" "}
              {d.agenda_total} de hoy.
            </p>
          )}
        </section>
        <section className={panel}>
          <h2 className="font-serif text-2xl font-semibold">
            Gestión preventiva
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ejecución del Plan activo del año actual.
          </p>
          <AvancePreventivo planes={d.planes} />
        </section>
      </div>
    </div>
  );
}
