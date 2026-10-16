// PB-019 y PB-020: textos y límites de las importaciones que usan tanto las
// páginas como los formularios del navegador (datos.ts solo corre en el
// servidor).

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

// PB-020 (HU-015 CA4): estado de cada fila en la vista previa.
export type EstadoFila =
  "PENDIENTE" | "VALIDO" | "ADVERTENCIA" | "ERROR" | "CONFIRMADO" | "OMITIDO";

export const NOMBRE_ESTADO_FILA: Record<EstadoFila, string> = {
  PENDIENTE: "Sin revisar",
  VALIDO: "Válida",
  ADVERTENCIA: "Con advertencia",
  ERROR: "Con error",
  CONFIRMADO: "Confirmada",
  OMITIDO: "Omitida",
};

// HU-015 CA3: cómo vienen las fechas escritas como texto y qué hacer con lo
// que ya existe en CONVI (decisión del PO: nunca se sobrescribe una ficha).
export const FORMATOS_FECHA = [
  { valor: "DD-MM-AAAA", nombre: "Día-mes-año, como 15-04-2016" },
  { valor: "MM-DD-AAAA", nombre: "Mes-día-año, como 04-15-2016" },
];

export const TRATAMIENTOS_DUPLICADO = [
  {
    valor: "USAR_EXISTENTE",
    nombre: "Usar el registro que ya existe, sin cambiar sus datos",
  },
  { valor: "ERROR", nombre: "Marcar la fila con error" },
];

export const NOMBRE_ROL: Record<string, string> = {
  PROFESOR_JEFE: "Profesor jefe",
  PROFESOR: "Profesor",
};