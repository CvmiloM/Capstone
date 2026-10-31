// PB-061 y PB-062 (HU-054): nombres y límites del plan de intervención que
// también usa el navegador. Mismos límites que valida la API
// (apps/api/src/modules/situaciones/plan-intervencion.ts).

export const LARGO_MAXIMO_OBJETIVO_PLAN = 2000;
export const LARGO_MAXIMO_DESCRIPCION_ACCION = 1000;
export const LARGO_MAXIMO_NOTAS_ACCION = 2000;
export const LARGO_MAXIMO_MOTIVO_PLAN = 500;

export const NOMBRE_ESTADO_PLAN: Record<string, string> = {
  BORRADOR: "Borrador",
  ACTIVO: "Activo",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

export const NOMBRE_ESTADO_ACCION: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En progreso",
  COMPLETADO: "Completada",
  CANCELADO: "Cancelada",
  VENCIDO: "Vencida",
};

/** Perfiles de quienes pueden ser responsables de una acción. */
export const NOMBRE_PERFIL_RESPONSABLE: Record<string, string> = {
  CONVIVENCIA: "Convivencia",
  PROFESOR: "Profesor",
  ADMIN: "Administración",
};

// PB-082, PB-055 y PB-056 (HU-071, HU-048 y HU-049): protocolo aplicado y sus
// pasos. Mismos límites que valida la API
// (apps/api/src/modules/situaciones/pasos-protocolo.ts).
export const LARGO_MAXIMO_NOTAS_PASO = 2000;
export const LARGO_MAXIMO_MOTIVO_PROTOCOLO = 500;

export const NOMBRE_ESTADO_PROTOCOLO: Record<string, string> = {
  ACTIVO: "Activo",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

export const NOMBRE_ESTADO_PASO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En progreso",
  COMPLETADO: "Completado",
  OMITIDO: "Omitido",
  VENCIDO: "Vencido",
};

// PB-063 y PB-064 (HU-055): encuentros del caso. Mismos límites que valida la
// API (apps/api/src/modules/situaciones/encuentros.ts).
export const LARGO_MAXIMO_OBJETIVO_ENCUENTRO = 1000;
export const LARGO_MAXIMO_DESCRIPCION_ENCUENTRO = 2000;
export const LARGO_MAXIMO_LUGAR = 160;
export const LARGO_MAXIMO_RESULTADO = 4000;

export const TIPOS_ENCUENTRO = [
  { valor: "ENTREVISTA", texto: "Entrevista" },
  { valor: "REUNION", texto: "Reunión" },
  { valor: "MEDIACION", texto: "Mediación" },
  { valor: "INTERVENCION", texto: "Intervención" },
  { valor: "ACOMPANAMIENTO", texto: "Acompañamiento" },
] as const;

export const NOMBRE_TIPO_ENCUENTRO: Record<string, string> = Object.fromEntries(
  TIPOS_ENCUENTRO.map((t) => [t.valor, t.texto]),
);

export const NOMBRE_ESTADO_ENCUENTRO: Record<string, string> = {
  PLANIFICADA: "Planificado",
  POSPUESTA: "Pospuesto",
  REALIZADA: "Realizado",
  CANCELADA: "Cancelado",
};

/** CA4: asistencia de cada participante. */
export const ASISTENCIAS = [
  { valor: "ASISTIO", texto: "Asistió" },
  { valor: "NO_ASISTIO", texto: "No asistió" },
  { valor: "JUSTIFICADO", texto: "Justificado" },
] as const;

export const NOMBRE_ASISTENCIA: Record<string, string> = {
  PENDIENTE: "Pendiente",
  ...Object.fromEntries(ASISTENCIAS.map((a) => [a.valor, a.texto])),
};

export const NOMBRE_ROL_ASISTENTE: Record<string, string> = {
  ESTUDIANTE: "Estudiante",
  APODERADO: "Apoderado o apoderada",
  EQUIPO: "Equipo de la escuela",
};

// PB-067 (HU-058): comunicaciones del caso. Mismos valores y límites que valida
// la API (apps/api/src/modules/situaciones/comunicaciones.ts). El correo se
// prepara y envía con HU-076.
export const TIPOS_COMUNICACION = [
  { valor: "LLAMADA", texto: "Llamada" },
  { valor: "PRESENCIAL", texto: "Presencial" },
  { valor: "INSTITUCIONAL", texto: "Institucional" },
  { valor: "OTRO", texto: "Otro" },
] as const;

export const NOMBRE_TIPO_COMUNICACION: Record<string, string> = Object.fromEntries(
  TIPOS_COMUNICACION.map((t) => [t.valor, t.texto]),
);

export const LARGO_MAXIMO_RESUMEN_COMUNICACION = 4000;
export const LARGO_MAXIMO_DESTINATARIO_EXTERNO = 220;
/** Valor de la lista de destinatarios que pide escribir uno fuera del caso. */
export const DESTINATARIO_EXTERNO = "externo";

// PB-151 y PB-086 (HU-130 y HU-075): correos al apoderado. Mismos límites que
// valida la API (apps/api/src/modules/situaciones/correos.ts).
export const LARGO_MAXIMO_ASUNTO = 220;
export const LARGO_MAXIMO_CONTENIDO = 10000;
export const LARGO_MAXIMO_DIRECCION = 220;
export const LARGO_MAXIMO_INDICACION = 500;
export const NOMBRE_ESTADO_CORREO: Record<string, string> = {
  BORRADOR: "Borrador",
  PENDIENTE: "Pendiente de envío",
  ENVIADO: "Enviado",
  ENTREGADO: "Entregado",
  FALLIDO: "Fallido",
  REBOTADO: "Rebotado",
};

export const ESTADOS_CUMPLIMIENTO: [string,string][] = [["PENDIENTE","Pendiente"],["EN_PROGRESO","En progreso"],["COMPLETADO","Completado"],["VENCIDO","Vencido"],["CANCELADO","Cancelado"]];
