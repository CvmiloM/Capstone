// PB-155 (HU-134): nombres que se muestran en la revisión normativa. Están
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
