import { PestanasGrupo } from "../pestanas-grupo";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { FormularioConCarga } from "@/app/components/actividad";
import {
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { pedir } from "../datos";

// PB-085 (HU-074): calendario de Convivencia. Reúne en un mes las fechas de
// encuentros y seguimientos, compromisos, pasos de protocolo, acciones de los
// planes de intervención y actividades del Plan de Gestión. No guarda copias:
// cada evento abre su registro de origen, donde se edita o reprograma (CA2), y
// esa pantalla vuelve a comprobar el permiso (CA1).

type TipoEvento =
  | "ACTUACION"
  | "COMPROMISO"
  | "PASO_PROTOCOLO"
  | "ACCION_INTERVENCION"
  | "PLAN_GESTION";

type Evento = {
  tipo: TipoEvento;
  origen_id: string;
  caso_id: string | null;
  caso_codigo: string | null;
  tipo_actuacion: string | null;
  accion_plan: string | null;
  plan_nombre: string | null;
  objetivo_plan: string | null;
  titulo: string;
  estado: string;
  dia: string;
  hora: string;
  dia_fin: string | null;
  hora_fin: string | null;
  vencido: boolean;
  terminado: boolean;
};

// Misma forma que devuelve apps/api/src/modules/calendario/calendario.service.ts.
type MesCalendario = {
  mes: string;
  desde: string;
  hasta: string;
  hoy: string;
  zona_horaria: string;
  eventos: Evento[];
  recortado: boolean;
};

const TIPOS: { tipo: TipoEvento; texto: string; color: string }[] = [
  { tipo: "ACTUACION", texto: "Encuentros y seguimientos", color: "bg-primary" },
  { tipo: "COMPROMISO", texto: "Compromisos", color: "bg-verde" },
  { tipo: "PASO_PROTOCOLO", texto: "Pasos de protocolo", color: "bg-amarillo" },
  {
    tipo: "ACCION_INTERVENCION",
    texto: "Acciones de intervención",
    color: "bg-naranjo",
  },
  { tipo: "PLAN_GESTION", texto: "Plan de Gestión", color: "bg-highlight" },
];

const BORDE: Record<TipoEvento, string> = {
  ACTUACION: "border-l-primary",
  COMPROMISO: "border-l-verde",
  PASO_PROTOCOLO: "border-l-amarillo",
  ACCION_INTERVENCION: "border-l-naranjo",
  PLAN_GESTION: "border-l-highlight",
};

const ESTADOS: Record<string, string> = {
  PLANIFICADA: "Planificado",
  PLANIFICADO: "Planificado",
  POSPUESTA: "Pospuesto",
  REALIZADA: "Realizado",
  CANCELADA: "Cancelado",
  CANCELADO: "Cancelado",
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En progreso",
  COMPLETADO: "Completado",
  OMITIDO: "Omitido",
  VENCIDO: "Vencido",
};

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Cuántos eventos caben en cada día de la grilla, el resto va en la lista. */
const POR_DIA = 3;

/** Registro de origen de cada evento, en el detalle de su caso. */
function enlaceOrigen(e: Evento): string | null {
  if (e.tipo === 'PLAN_GESTION') return `/convivencia/plan-gestion/actividades/${e.origen_id}`;
  if (!e.caso_id) return null;
  const caso = `/convivencia/casos/${e.caso_id}`;
  switch (e.tipo) {
    case "ACTUACION":
      return e.tipo_actuacion === "SEGUIMIENTO"
        ? `${caso}?seccion=seguimientos#seguimiento-${e.origen_id}`
        : `${caso}?seccion=encuentros#encuentro-${e.origen_id}`;
    case "COMPROMISO":
      return `${caso}?seccion=compromisos`;
    case "PASO_PROTOCOLO":
      return `${caso}?seccion=protocolo#paso-${e.origen_id}`;
    case "ACCION_INTERVENCION":
      return `${caso}?seccion=plan`;
    default:
      return null;
  }
}

function nombreTipo(e: Evento) {
  if (e.tipo === "ACTUACION")
    return e.tipo_actuacion === "SEGUIMIENTO" ? "Seguimiento" : "Encuentro";
  return TIPOS.find((t) => t.tipo === e.tipo)?.texto ?? e.tipo;
}

/** Días de la grilla, de lunes a domingo, en texto AAAA-MM-DD. */
function diasEntre(desde: string, hasta: string) {
  const dias: string[] = [];
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= fin; t += 86_400_000)
    dias.push(new Date(t).toISOString().slice(0, 10));
  return dias;
}

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

const nombreDia = (dia: string) =>
  new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${dia}T12:00:00Z`));

export const metadata = { title: "Calendario de Convivencia" };

export default async function Calendario({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; tipos?: string }>;
}) {
  const filtros = await searchParams;
  const consulta = new URLSearchParams({
    mes: filtros.mes ?? "",
    tipos: filtros.tipos ?? "",
  });
  const r = await pedir<MesCalendario>(`/convivencia/calendario?${consulta}`);
  if (!r.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const c = r.datos;

  const activos = new Set<TipoEvento>(
    filtros.tipos
      ? (filtros.tipos.split(",") as TipoEvento[])
      : TIPOS.map((t) => t.tipo),
  );
  const ruta = (mes: string, tipos: Set<TipoEvento>) => {
    const p = new URLSearchParams({ mes });
    if (tipos.size > 0 && tipos.size < TIPOS.length)
      p.set("tipos", TIPOS.filter((t) => tipos.has(t.tipo)).map((t) => t.tipo).join(","));
    return `?${p}`;
  };
  const alternar = (tipo: TipoEvento) => {
    const otros = new Set(activos);
    if (otros.has(tipo)) otros.delete(tipo);
    else otros.add(tipo);
    return ruta(c.mes, otros);
  };

  const porDia = new Map<string, Evento[]>();
  for (const e of c.eventos) porDia.set(e.dia, [...(porDia.get(e.dia) ?? []), e]);
  const diasDelMes = [...porDia.keys()].filter((d) => d.startsWith(c.mes)).sort();
  const pendientes = c.eventos.filter((e) => e.vencido).length;

  return (
    <div className="space-y-6">
      <PestanasGrupo grupo="agenda" className="" />
      <header>
        <h1 className="font-titulo text-3xl font-semibold">
          Calendario de Convivencia
        </h1>
        <p className="mt-2 text-muted-foreground">
          Las fechas de casos, protocolos, planes y Plan de Gestión en un solo
          mes, abre cada evento para editarlo o reprogramarlo en su registro
        </p>
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
          {filtros.tipos && (
            <input type="hidden" name="tipos" value={filtros.tipos} />
          )}
          <button type="submit" className={claseBotonPrimario}>
            Ver mes
          </button>
        </FormularioConCarga>
      </div>

      <nav aria-label="Tipos de evento" className="flex flex-wrap gap-2">
        {TIPOS.map((t) => {
          const activo = activos.has(t.tipo);
          return (
            <Link
              key={t.tipo}
              href={alternar(t.tipo)}
              aria-pressed={activo}
              className={`presion inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                activo
                  ? "border-primary/30 bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground line-through hover:bg-muted"
              }`}
            >
              <span aria-hidden className={`size-2.5 rounded-full ${t.color}`} />
              {t.texto}
            </Link>
          );
        })}
      </nav>

      <p className="text-sm text-muted-foreground">
        {c.eventos.length} eventos entre el {c.desde} y el {c.hasta}
        {pendientes > 0 && `, ${pendientes} con la fecha pasada sin terminar`}
        {`, horario de ${c.zona_horaria}`}
      </p>
      {c.recortado && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          El mes tiene más eventos de los que se pueden mostrar, filtra por tipo
          para verlos todos
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-tarjeta">
        <div className="grid grid-cols-7 border-b border-border bg-muted/60 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {diasEntre(c.desde, c.hasta).map((dia, i) => {
            const eventos = porDia.get(dia) ?? [];
            const fuera = !dia.startsWith(c.mes);
            const hoy = dia === c.hoy;
            return (
              <div
                key={dia}
                className={`min-h-32 border-border p-2 ${i % 7 !== 6 ? "border-r" : ""} ${
                  i >= 7 ? "border-t" : ""
                } ${fuera ? "bg-muted/30" : ""}`}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={`inline-flex size-7 items-center justify-center rounded-full text-sm ${
                      hoy
                        ? "bg-primary font-semibold text-primary-foreground"
                        : fuera
                          ? "text-muted-foreground/60"
                          : "text-foreground"
                    }`}
                    aria-label={hoy ? `Hoy, ${nombreDia(dia)}` : nombreDia(dia)}
                  >
                    {Number(dia.slice(8))}
                  </span>
                </div>
                <ul className="space-y-1">
                  {eventos.slice(0, POR_DIA).map((e) => (
                    <li key={`${e.tipo}-${e.origen_id}`}>
                      <Chip evento={e} />
                    </li>
                  ))}
                </ul>
                {eventos.length > POR_DIA && (
                  <a
                    href={`#dia-${dia}`}
                    className="mt-1 block text-xs font-medium text-primary hover:underline"
                  >
                    {eventos.length - POR_DIA} más
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <section aria-labelledby="lista-mes" className="space-y-4">
        <h2 id="lista-mes" className="font-titulo text-xl font-semibold">
          Eventos del mes
        </h2>
        {diasDelMes.length === 0 && (
          <p className="rounded-2xl border border-border p-6 text-muted-foreground">
            No hay eventos en este mes con los tipos elegidos
          </p>
        )}
        {diasDelMes.map((dia) => (
          <div key={dia} id={`dia-${dia}`} className="scroll-mt-24">
            <h3 className="mb-2 text-sm font-semibold capitalize text-muted-foreground">
              {nombreDia(dia)}
            </h3>
            <ul className="space-y-2">
              {(porDia.get(dia) ?? []).map((e) => (
                <li key={`${e.tipo}-${e.origen_id}`}>
                  <Fila evento={e} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

/** Evento corto dentro de la grilla. */
function Chip({ evento: e }: { evento: Evento }) {
  const destino = enlaceOrigen(e);
  const clase = `block truncate rounded-md border-l-4 px-2 py-1 text-xs ${BORDE[e.tipo]} ${
    e.vencido
      ? "bg-destructive/10 text-destructive"
      : e.terminado
        ? "bg-muted/60 text-muted-foreground line-through"
        : "bg-muted/60"
  }`;
  const texto = (
    <>
      {e.hora !== "00:00" && <span className="font-medium">{e.hora} </span>}
      {e.titulo}
    </>
  );
  const titulo = `${nombreTipo(e)}: ${e.titulo}`;
  return destino ? (
    <Link
      href={destino}
      title={titulo}
      className={`${clase} presion transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring`}
    >
      {texto}
    </Link>
  ) : (
    <span title={titulo} className={clase}>
      {texto}
    </span>
  );
}

/** Evento completo en la lista del mes. */
function Fila({ evento: e }: { evento: Evento }) {
  const destino = enlaceOrigen(e);
  const contenido = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className={`font-medium ${e.terminado ? "line-through" : ""}`}>
          {e.titulo}
        </span>
        <span className="flex gap-2">
          {e.vencido && (
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs text-destructive">
              Fecha pasada
            </span>
          )}
          <span className="rounded-full bg-muted px-3 py-1 text-xs">
            {ESTADOS[e.estado] ?? e.estado}
          </span>
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {nombreTipo(e)}
        {e.hora !== "00:00" && `, ${e.hora}`}
        {e.hora_fin &&
          (e.dia_fin === e.dia ? ` a ${e.hora_fin}` : ` hasta el ${e.dia_fin} ${e.hora_fin}`)}
        {e.caso_codigo && `, caso ${e.caso_codigo}`}
        {e.plan_nombre && `, Plan ${e.plan_nombre}`}
        {e.objetivo_plan && `, objetivo ${e.objetivo_plan}`}
        {e.accion_plan && `, acción ${e.accion_plan}`}
      </p>
    </>
  );
  const clase = `block rounded-2xl border border-l-4 border-border bg-card p-4 ${BORDE[e.tipo]}`;
  return destino ? (
    <Link
      href={destino}
      className={`${clase} transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring`}
    >
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}
