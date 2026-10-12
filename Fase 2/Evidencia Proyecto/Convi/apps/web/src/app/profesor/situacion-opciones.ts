// Opciones del registro de situaciones (PB-042). No usa código de servidor
// porque también las usa el formulario en el navegador. Deben coincidir con
// apps/api/src/modules/situaciones/nueva-situacion.ts, que es la que decide.

/** Rol de cada estudiante en el hecho (participaciones.rol_contextual). */
export const ROLES_EN_SITUACION = [
  { valor: "AFECTADO", texto: "Afectado" },
  { valor: "INVOLUCRADO", texto: "Involucrado" },
  { valor: "TESTIGO", texto: "Testigo" },
] as const;

export const NOMBRE_ROL_EN_SITUACION: Record<string, string> =
  Object.fromEntries(ROLES_EN_SITUACION.map((r) => [r.valor, r.texto]));

/** HU-035 CA3: queda en Normal salvo que el profesor declare otra urgencia. */
export const OPCIONES_URGENCIA = [
  { valor: "NORMAL", texto: "Normal" },
  { valor: "URGENTE", texto: "Urgente" },
  { valor: "INMEDIATA", texto: "Inmediata" },
] as const;

export const LARGO_MAXIMO_SITUACION = { lugar: 120, descripcion: 4000 } as const;