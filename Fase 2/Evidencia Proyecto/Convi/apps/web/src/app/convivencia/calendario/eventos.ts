// PB-085 (HU-074): tipos, textos y ayudas del calendario, compartidos por la
// página (servidor) y la grilla con el panel del día (cliente).

export type TipoEvento =
  | "ACTUACION"
  | "COMPROMISO"
  | "PASO_PROTOCOLO"
  | "ACCION_INTERVENCION"
  | "PLAN_GESTION";

// Misma forma que devuelve apps/api/src/modules/calendario/calendario.service.ts.
export type Evento = {
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

export type MesCalendario = {
  mes: string;
  desde: string;
  hasta: string;
  hoy: string;
  zona_horaria: string;
  eventos: Evento[];
  recortado: boolean;
};

export const TIPOS: { tipo: TipoEvento; texto: string; color: string }[] = [
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

export const BORDE: Record<TipoEvento, string> = {
  ACTUACION: "border-l-primary",
  COMPROMISO: "border-l-verde",
  PASO_PROTOCOLO: "border-l-amarillo",
  ACCION_INTERVENCION: "border-l-naranjo",
  PLAN_GESTION: "border-l-highlight",
};

export const ESTADOS: Record<string, string> = {
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

export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Seguimiento de un caso: lo que antes listaba la Agenda de seguimientos. */
export const esSeguimiento = (e: Evento) =>
  e.tipo === "ACTUACION" && e.tipo_actuacion === "SEGUIMIENTO";

/** Registro de origen de cada evento, en el detalle de su caso o del Plan. */
export function enlaceOrigen(e: Evento): string | null {
  if (e.tipo === "PLAN_GESTION")
    return `/convivencia/plan-gestion/actividades/${e.origen_id}`;
  if (!e.caso_id) return null;
  const caso = `/convivencia/casos/${e.caso_id}`;
  switch (e.tipo) {
    case "ACTUACION":
      return esSeguimiento(e)
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

export function nombreTipo(e: Evento) {
  if (e.tipo === "ACTUACION") return esSeguimiento(e) ? "Seguimiento" : "Encuentro";
  return TIPOS.find((t) => t.tipo === e.tipo)?.texto ?? e.tipo;
}

/** Días de la grilla, de lunes a domingo, en texto AAAA-MM-DD. */
export function diasEntre(desde: string, hasta: string) {
  const dias: string[] = [];
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= fin; t += 86_400_000)
    dias.push(new Date(t).toISOString().slice(0, 10));
  return dias;
}

/** «viernes, 6 de noviembre», sin correr el día por la zona horaria. */
export const nombreDia = (dia: string) =>
  new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${dia}T12:00:00Z`));
