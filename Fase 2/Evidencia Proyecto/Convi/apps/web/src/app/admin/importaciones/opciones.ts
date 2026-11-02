// PB-019, PB-020, PB-024 y PB-025: textos y límites de las importaciones que
// usan tanto las páginas como los formularios del navegador (datos.ts solo
// corre en el servidor).

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

// PB-025 (HU-019 CA4 y CA5): motivo de cancelar o restaurar. La API lo exige igual.
export const LARGO_MOTIVO = { minimo: 10, maximo: 500 };

// PB-024 (HU-019 CA2): largo máximo de un valor corregido, como en la API.
export const LARGO_MAXIMO_VALOR = 1000;

/**
 * PB-024: el valor de cada campo según el archivo, como lo arma la API
 * (valoresDeFila en mapeo.ts): las columnas en orden y, si un campo trae
 * varias, juntas con un espacio.
 */
export function valoresDelArchivo(
  datos: Record<string, string>,
  mapeo: Record<string, string>,
  columnas: string[],
) {
  const valores: Record<string, string> = {};
  for (const columna of columnas) {
    const clave = mapeo[columna];
    const valor = (datos[columna] ?? "").trim();
    if (!clave || !valor) continue;
    valores[clave] = valores[clave] ? `${valores[clave]} ${valor}` : valor;
  }
  return valores;
}

/** "1 fila", "1.200 filas". */
export function filas(cantidad: number) {
  return `${cantidad.toLocaleString("es-CL")} ${cantidad === 1 ? "fila" : "filas"}`;
}

/** PB-027: el resultado de una confirmación, en palabras. */
export function describirResultado(resultado: {
  confirmadas: number;
  con_error: number;
  sin_enviar: number;
}) {
  const partes = [
    resultado.confirmadas > 0
      ? `Se guardaron en las fichas ${filas(resultado.confirmadas)}.`
      : "No se guardó ninguna fila.",
  ];
  if (resultado.con_error > 0)
    partes.push(
      `${filas(resultado.con_error)} no se pudieron confirmar y quedaron Con error: revisa su detalle.`,
    );
  if (resultado.sin_enviar > 0)
    partes.push(
      `${filas(resultado.sin_enviar)} de profesores quedaron sin invitar porque se alcanzó el límite de correos: vuelve a confirmar en unos minutos.`,
    );
  return partes.join(" ");
}