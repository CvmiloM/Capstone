// PB-015: textos y reglas de cursos que usan tanto las páginas como los
// formularios del navegador (datos.ts solo corre en el servidor).
export type Rol = "PROFESOR_JEFE" | "PROFESOR";

export const NOMBRE_ROL: Record<Rol, string> = {
  PROFESOR_JEFE: "Profesor jefe",
  PROFESOR: "Profesor del curso",
};

// Decisión del PO: los cursos y sus asignaciones solo cambian en años
// Planificados o Activos. La API lo exige igual; aquí solo oculta los formularios.
export const ANIOS_EDITABLES = ["PLANIFICADO", "ACTIVO"];

// PB-023 (HU-018 CA1): largo del motivo de una corrección en un año Cerrado,
// el mismo que valida la API.
export const LARGO_MOTIVO = { minimo: 10, maximo: 500 } as const;

// Mismos largos que valida la API.
export const LARGO_MAXIMO_CURSO = {
  codigo: 40,
  nombre: 120,
  seccion: 20,
} as const;