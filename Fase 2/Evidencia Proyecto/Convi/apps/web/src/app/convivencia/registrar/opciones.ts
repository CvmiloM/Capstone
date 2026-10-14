// Opciones del registro por otros canales (PB-043). No usa código de servidor
// porque también las usa el formulario en el navegador. La API decide qué se
// acepta (apps/api/src/modules/situaciones/nueva-situacion.ts).

/** HU-036 CA1: quién informó la situación. */
export const ORIGENES = [
  { valor: "ESTUDIANTE", texto: "Estudiante" },
  { valor: "APODERADO", texto: "Apoderado" },
  { valor: "FUNCIONARIO", texto: "Funcionario" },
  { valor: "OTRO", texto: "Otro" },
] as const;
