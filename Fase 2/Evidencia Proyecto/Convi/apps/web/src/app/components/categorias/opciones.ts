// PB-030: límites y estados de las categorías que usan tanto las páginas como
// los formularios del navegador (datos.ts solo corre en el servidor).

// Mismos largos que valida la API.
export const LARGO_MAXIMO_CATEGORIA = {
  nombre: 120,
  descripcion: 500,
} as const;

export type EstadoCategoria = "ACTIVO" | "INACTIVO";