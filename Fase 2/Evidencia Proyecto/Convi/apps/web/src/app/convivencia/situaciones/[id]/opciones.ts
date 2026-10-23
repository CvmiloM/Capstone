// PB-155 (HU-134) y decisiones: nombres que se muestran en el detalle. Están
// aparte de datos.ts porque el formulario del navegador también los usa.

/** HU-134 CA1: si la norma aplica a la situación. */
export const APLICABILIDAD: Record<string, string> = {
  APLICABLE: "Aplicable",
  NO_APLICABLE: "No aplicable",
  POR_CONFIRMAR: "Por confirmar",
};

/** HU-134 CA3: cómo se hizo la revisión. */
export const MODO_REVISION: Record<string, string> = {
  MANUAL: "Manual",
  ASISTIDA_IA: "Asistida por IA",
};

// PB-047, PB-048 y PB-051: decisiones que cierran la revisión.

/** Resultado de cada decisión (revisiones_convivencia.resultado). */
export const NOMBRE_DECISION: Record<string, string> = {
  ANTECEDENTE: "Antecedente",
  DESCARTADA: "Descartada",
  INFORMACION_SOLICITADA: "Información solicitada",
  VINCULADA_CASO: "Vinculada a un caso",
};

/** HU-041: motivos del descarte, mismos valores que valida la API. */
export const MOTIVOS_DESCARTE = [
  { valor: "DUPLICADO", texto: "Duplicado de otra situación" },
  { valor: "ERRONEO", texto: "Error en el registro" },
  { valor: "FUERA_DE_ALCANCE", texto: "Fuera de alcance de Convivencia" },
] as const;
