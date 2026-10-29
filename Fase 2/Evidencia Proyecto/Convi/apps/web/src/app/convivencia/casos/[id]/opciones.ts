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
