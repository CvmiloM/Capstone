import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { FormularioConCarga } from "@/app/components/actividad";
import {
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { pedir } from "../datos";
import { esSeguimiento, type MesCalendario, TIPOS, type TipoEvento } from "./eventos";
import { GrillaCalendario } from "./grilla";
import { type EstadoSuscripcion, SuscripcionCalendario } from "./suscripcion";

// PB-085 (HU-074): calendario de Convivencia. Reúne en un mes las fechas de
// encuentros y seguimientos, compromisos, pasos de protocolo, acciones de los
// planes de intervención y actividades del Plan de Gestión. No guarda copias:
// cada evento abre su registro de origen, donde se edita o reprograma (CA2), y
// esa pantalla vuelve a comprobar el permiso (CA1).
//
// Refinamientos de Convivencia, sección 5: los eventos de un día se ven en un
// panel lateral (grilla.tsx) en vez de una lista larga bajo el calendario, y la
// antigua Agenda de seguimientos es el filtro Solo seguimientos (?seguimientos=1),
// porque mostraba los mismos seguimientos del mes con enlace a su caso.

function mover(mes: string, cuanto: number) {
  const [anio, numero] = mes.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, numero - 1 + cuanto, 1));
  return fecha.toISOString().slice(0, 7);
}

const nombreMes = (mes: string) =>
  new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${mes}-01T12:00:00Z`));

const claseFiltro = (activo: boolean) =>
  `presion inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
    activo
      ? "border-primary/30 bg-accent text-accent-foreground"
      : "border-border bg-card text-muted-foreground line-through hover:bg-muted"
  }`;

export const metadata = { title: "Calendario de Convivencia" };

export default async function Calendario({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; tipos?: string; seguimientos?: string }>;
}) {
  const filtros = await searchParams;
  const soloSeguimientos = filtros.seguimientos === "1";
  // Solo seguimientos pide a la API únicamente los encuentros y seguimientos.
  const consulta = new URLSearchParams({
    mes: filtros.mes ?? "",
    tipos: soloSeguimientos ? "ACTUACION" : (filtros.tipos ?? ""),
  });
  // Refinamientos de Convivencia, sección 5: estado del enlace para Google
  // Calendar, en paralelo con los eventos del mes. Si falla, el calendario se
  // muestra igual, sin el botón.
  const [r, s] = await Promise.all([
    pedir<MesCalendario>(`/convivencia/calendario?${consulta}`),
    pedir<EstadoSuscripcion>("/convivencia/calendario/suscripcion").catch(
      () => ({ ok: false }) as const,
    ),
  ]);
  if (!r.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const c = r.datos;
  const eventos = soloSeguimientos ? c.eventos.filter(esSeguimiento) : c.eventos;

  const activos = new Set<TipoEvento>(
    filtros.tipos
      ? (filtros.tipos.split(",") as TipoEvento[])
      : TIPOS.map((t) => t.tipo),
  );
  const ruta = (mes: string, tipos: Set<TipoEvento>, seguimientos = soloSeguimientos) => {
    const p = new URLSearchParams({ mes });
    if (seguimientos) p.set("seguimientos", "1");
    else if (tipos.size > 0 && tipos.size < TIPOS.length)
      p.set("tipos", TIPOS.filter((t) => tipos.has(t.tipo)).map((t) => t.tipo).join(","));
    return `?${p}`;
  };
  const alternar = (tipo: TipoEvento) => {
    const otros = new Set(activos);
    if (otros.has(tipo)) otros.delete(tipo);
    else otros.add(tipo);
    return ruta(c.mes, otros, false);
  };

  // La grilla también muestra días del mes anterior y del siguiente, el
  // resumen cuenta solo los eventos del mes, también los atrasados.
  const delMes = eventos.filter((e) => e.dia.startsWith(c.mes));
  const enElMes = delMes.length;
  const pendientes = delMes.filter((e) => e.vencido).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="font-titulo text-3xl font-semibold">
            Calendario de Convivencia
          </h1>
          <p className="mt-2 text-muted-foreground">
            Las fechas de casos, protocolos, planes y Plan de Gestión en un solo
            mes, elige un día para ver todos sus eventos y abre cada uno para
            editarlo o reprogramarlo en su registro
          </p>
        </div>
        {s.ok && (
          <SuscripcionCalendario estado={s.datos} zonaHoraria={c.zona_horaria} />
        )}
      </header>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            href={ruta(mover(c.mes, -1), activos)}
            className={claseBotonSecundario}
            aria-label="Mes anterior"
          >
            ←
          </Link>
          <h2 className="min-w-48 text-center font-titulo text-xl font-semibold capitalize">
            {nombreMes(c.mes)}
          </h2>
          <Link
            href={ruta(mover(c.mes, 1), activos)}
            className={claseBotonSecundario}
            aria-label="Mes siguiente"
          >
            →
          </Link>
          {!c.hoy.startsWith(c.mes) && (
            <Link
              href={ruta(c.hoy.slice(0, 7), activos)}
              className={claseBotonSecundario}
            >
              Hoy
            </Link>
          )}
        </div>
        <FormularioConCarga className="flex items-end gap-3">
          <div>
            <label htmlFor="mes" className="mb-2 block text-sm font-medium">
              Ir al mes
            </label>
            <input
              id="mes"
              name="mes"
              type="month"
              defaultValue={c.mes}
              className="rounded-xl border border-input bg-card px-3 py-2 focus-visible:outline-ring"
            />
          </div>
          {soloSeguimientos ? (
            <input type="hidden" name="seguimientos" value="1" />
          ) : (
            filtros.tipos && <input type="hidden" name="tipos" value={filtros.tipos} />
          )}
          <button type="submit" className={claseBotonPrimario}>
            Ver mes
          </button>
        </FormularioConCarga>
      </div>

      <nav aria-label="Tipos de evento" className="flex flex-wrap items-center gap-2">
        {TIPOS.map((t) => {
          const activo = !soloSeguimientos && activos.has(t.tipo);
          return (
            <Link key={t.tipo} href={alternar(t.tipo)} className={claseFiltro(activo)}>
              <span aria-hidden className={`size-2.5 rounded-full ${t.color}`} />
              {t.texto}
              {/* aria-pressed no vale en un enlace, el estado va en texto. */}
              <span className="sr-only">{activo ? ", se muestran" : ", ocultos"}</span>
            </Link>
          );
        })}
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
        <Link
          href={ruta(c.mes, activos, !soloSeguimientos)}
          className={claseFiltro(soloSeguimientos)}
        >
          Solo seguimientos
          <span className="sr-only">
            {soloSeguimientos ? ", activado" : ", desactivado"}
          </span>
        </Link>
      </nav>

      <p className="text-sm text-muted-foreground">
        {enElMes === 1 ? "1 evento" : `${enElMes} eventos`} en {nombreMes(c.mes)}
        {soloSeguimientos && ", solo seguimientos de casos"}
        {pendientes > 0 && `, ${pendientes} con la fecha pasada sin terminar`}
        {`, horario de ${c.zona_horaria}`}
      </p>
      {c.recortado && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          El mes tiene más eventos de los que se pueden mostrar, filtra por tipo
          para verlos todos
        </p>
      )}

      <GrillaCalendario
        eventos={eventos}
        desde={c.desde}
        hasta={c.hasta}
        hoy={c.hoy}
        mes={c.mes}
      />
    </div>
  );
}
