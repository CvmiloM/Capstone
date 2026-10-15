// PB-019: textos y límites de las importaciones que usan tanto las páginas
// como los formularios del navegador (datos.ts solo corre en el servidor).

export type TipoImportacion =
  | "ESTUDIANTES"
  | "CURSOS"
  | "PROFESORES"
  | "APODERADOS"
  | "MATRICULAS"
  | "ASIGNACIONES";

// HU-015 CA1: los seis tipos de datos administrativos.
export const NOMBRE_TIPO: Record<TipoImportacion, string> = {
  ESTUDIANTES: "Estudiantes",
  CURSOS: "Cursos",
  PROFESORES: "Profesores",
  APODERADOS: "Apoderados",
  MATRICULAS: "Matrículas",
  ASIGNACIONES: "Asignaciones de profesores",
};

export const NOMBRE_ESTADO: Record<string, string> = {
  CARGADO: "Cargada",
  PROCESANDO: "Procesando",
  REVISION: "En revisión",
  CONFIRMADO: "Confirmada",
  FALLIDO: "Fallida",
  CANCELADO: "Cancelada",
};

// Decisión del PO: hasta 5 MB y 5.000 filas. La API lo exige igual.
export const LIMITE_BYTES = 5 * 1024 * 1024;
export const FORMATOS_ACEPTADOS = ".csv,.xlsx";