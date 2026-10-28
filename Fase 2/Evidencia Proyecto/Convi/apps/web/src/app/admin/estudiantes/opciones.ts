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

// PB-031: filtro de estado de la nómina; sin valor, la API muestra los Activos.
export const FILTRO_ESTADO_NOMINA = [
  ["", "Activos"],
  ["INACTIVO", "Inactivos"],
  ["EGRESADO", "Egresados"],
  ["TODOS", "Todos"],
] as const;

// PB-022 y PB-031: movimientos que terminan la matrícula vigente, con los
// mismos tipos que valida la API.
export const MOVIMIENTOS_MATRICULA = [
  {
    tipo: "TRASLADO",
    nombre: "Cambio de curso",
    detalle:
      "Pasa a otro curso del mismo año. Su matrícula actual queda Trasladada.",
    fecha: "Primer día en el curso nuevo",
    ayuda: "Su matrícula actual termina el día anterior.",
    boton: "Registrar cambio de curso",
    listo: "Registraste el cambio de curso. La matrícula anterior quedó Trasladada.",
  },
  {
    tipo: "PROMOCION",
    nombre: "Paso al año siguiente",
    detalle:
      "Promoción o repitencia: sigue en un curso de un año posterior. Su matrícula actual queda Completada.",
    fecha: "Inicio en el curso nuevo",
    ayuda: "Su matrícula actual termina el último día de su año.",
    boton: "Registrar paso de año",
    listo: "Registraste el paso de año. La matrícula anterior quedó Completada.",
  },
  {
    tipo: "EGRESO",
    nombre: "Egreso",
    detalle:
      "Terminó su último año. Su matrícula queda Completada y el estudiante pasa a Egresado.",
    fecha: "Último día como estudiante",
    ayuda: "Hoy o antes.",
    boton: "Registrar egreso",
    listo: "Registraste el egreso. El estudiante pasó a Egresado y conserva sus matrículas.",
  },
  {
    tipo: "RETIRO",
    nombre: "Retiro",
    detalle:
      "Deja la escuela. Su matrícula queda Retirada y el estudiante pasa a Inactivo, sin borrar sus antecedentes ni sus casos.",
    fecha: "Último día en la escuela",
    ayuda: "Hoy o antes.",
    boton: "Registrar retiro",
    listo: "Registraste el retiro. El estudiante pasó a Inactivo y conserva sus antecedentes, casos y matrículas.",
  },
] as const;

export type TipoMovimiento = (typeof MOVIMIENTOS_MATRICULA)[number]["tipo"];