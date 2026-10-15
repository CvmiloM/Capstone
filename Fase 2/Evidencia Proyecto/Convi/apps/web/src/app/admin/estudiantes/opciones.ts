// PB-017 y PB-018: textos y límites de estudiantes que usan tanto las páginas
// como los formularios del navegador (datos.ts solo corre en el servidor).

// Mismos largos que valida la API.
export const LARGO_MAXIMO_ESTUDIANTE = {
  codigo_estudiante: 60,
  nombres: 100,
  apellidos: 120,
  correo: 180,
  telefono: 40,
  direccion: 200,
} as const;

export const NOMBRE_ESTADO_ESTUDIANTE: Record<string, string> = {
  ACTIVO: "Activo",
  INACTIVO: "Inactivo",
  EGRESADO: "Egresado",
};

export const NOMBRE_ESTADO_MATRICULA: Record<string, string> = {
  ACTIVO: "Vigente",
  TRASLADADO: "Trasladada",
  COMPLETADO: "Completada",
  RETIRADO: "Retirada",
};