// PB-066 (HU-057) y PB-130 (HU-111): evidencias de situaciones y casos,
// compartidas por los portales de Convivencia y del profesor. Están aparte de
// datos.ts porque el formulario del navegador también las usa.

/** Misma forma que devuelve apps/api/src/modules/situaciones/evidencias.service.ts. */
export type Evidencia = {
  id: string;
  titulo: string;
  tipo: string;
  descripcion?: string | null;
  /** Nombre original del archivo. */
  archivo: string | null;
  tamano_bytes?: number | null;
  creado_por?: string;
  creado_en: string;
  /** Dónde está ligada, por ejemplo "Caso" o "Situación SIT-2026-00010". */
  origen?: string;
};

export type EstadoEvidencia = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** Lo escrito, para no perderlo si hay errores (el archivo se vuelve a elegir). */
  valores?: Record<string, string>;
};

/** HU-057 CA1: mismos valores que valida la API. El acta llega con PB-072. */
export const TIPOS_EVIDENCIA = [
  { valor: "DOCUMENTO", texto: "Documento" },
  { valor: "IMAGEN", texto: "Imagen" },
  { valor: "CORREO", texto: "Correo" },
  { valor: "OTRO", texto: "Otro" },
] as const;

export const NOMBRE_TIPO_EVIDENCIA: Record<string, string> = {
  ...Object.fromEntries(TIPOS_EVIDENCIA.map((t) => [t.valor, t.texto])),
  ACTA: "Acta",
};

/** PB-130: formatos que acepta la API (archivo-evidencia.ts). */
export const ACEPTA = ".pdf,.docx,.jpg,.jpeg,.png,.webp,.eml";
export const TAMANO_MAXIMO = 25 * 1024 * 1024;

/** Dónde se adjunta: decide la ruta de la API y a qué página se vuelve. */
export type DestinoEvidencia =
  | "convivencia-situacion"
  | "convivencia-caso"
  // PB-055 (HU-048 CA3): evidencia del caso que respalda un paso del protocolo.
  | "convivencia-paso"
  // PB-072 (HU-062): acta firmada de una entrevista o reunión.
  | "convivencia-acta"
  | "profesor-situacion";

export function formatearTamano(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
