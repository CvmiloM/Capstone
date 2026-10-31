// PB-093 (HU-080) y PB-095 (HU-082): constantes de las alertas y los avisos
// que usan tanto el servidor como el formulario del navegador.

// Decisión del PO (por defecto): el mismo largo que valida la API.
export const LARGO_MAXIMO_OBSERVACION_ALERTA = 4000;

export const NOMBRE_ESTADO_ALERTA: Record<string, string> = {
  NUEVA: "Nueva",
  REVISADA: "Revisada",
  ARCHIVADO: "Archivada",
};

export const CLASE_ESTADO_ALERTA: Record<string, string> = {
  NUEVA: "bg-amarillo/25 text-tinta",
  REVISADA: "bg-verde/15 text-tinta",
  ARCHIVADO: "bg-muted text-muted-foreground",
};

/** Pestañas de la bandeja; la API recibe TODAS para no filtrar. */
export const FILTROS_ALERTA = [
  { valor: "NUEVA", texto: "Nuevas" },
  { valor: "REVISADA", texto: "Revisadas" },
  { valor: "ARCHIVADO", texto: "Archivadas" },
  { valor: "TODAS", texto: "Todas" },
] as const;

export const CLASE_PRIORIDAD: Record<string, string> = {
  ALTA: "bg-destructive/10 text-destructive",
  MEDIA: "bg-naranjo/15 text-tinta",
  BAJA: "bg-muted text-muted-foreground",
};

/** HU-080 CA2: los dos estados en que queda una alerta al revisarla. */
export const OPCIONES_REVISION = [
  {
    valor: "REVISADA",
    texto: "Revisada",
    ayuda: "Se atendió: escribe qué se hizo.",
  },
  {
    valor: "ARCHIVADO",
    texto: "Archivada",
    ayuda: "No requiere acción: escribe por qué.",
  },
] as const;

/** Lo que venció en un caso, según el registro que guardó el motor. */
export const NOMBRE_VENCIDO: Record<string, string> = {
  compromisos: "Compromiso",
  acciones_plan_intervencion: "Acción del plan de intervención",
  actuaciones: "Encuentro",
  estados_pasos_protocolo_caso: "Paso del protocolo",
};

/** Pestaña de la ficha del caso donde se ve cada tipo de vencido. */
export const SECCION_VENCIDO: Record<string, string> = {
  compromisos: "compromisos",
  acciones_plan_intervencion: "plan",
  actuaciones: "encuentros",
  estados_pasos_protocolo_caso: "protocolo",
};

/**
 * Fechas y horas en la zona horaria de la escuela, que la API envía junto con
 * los datos para no hacer otra consulta.
 */
export function formatoFecha(zonaHoraria: string) {
  const formato = new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zonaHoraria,
  });
  return (iso: string) => formato.format(new Date(iso));
}
