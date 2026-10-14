// Opciones de la pantalla Usuarios (PB-010). No usa código de servidor porque
// también las usa el formulario en el navegador. La API decide qué se acepta
// (apps/api/src/modules/cuentas/nueva-invitacion.ts).

export const NOMBRE_PERFIL: Record<string, string> = {
  ADMIN: "Administrador",
  CONVIVENCIA: "Convivencia",
  PROFESOR: "Profesor",
  APODERADO: "Apoderado",
};

export const NOMBRE_ESTADO: Record<string, string> = {
  PENDIENTE: "Pendiente de activar",
  ACTIVO: "Activa",
  SUSPENDIDO: "Suspendida",
  REVOCADO: "Revocada",
};

/** Perfiles que se invitan desde esta pantalla (los apoderados, más adelante). */
export const PERFILES_INVITABLES = [
  { valor: "PROFESOR", texto: "Profesor" },
  { valor: "CONVIVENCIA", texto: "Convivencia" },
] as const;

/** Mismos largos que valida la API (nueva-invitacion.ts). */
export const LARGO_MAXIMO = { nombres: 100, apellidos: 120, correo: 180 } as const;
