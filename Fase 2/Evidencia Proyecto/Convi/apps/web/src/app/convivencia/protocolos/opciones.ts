// PB-081 y PB-083: nombres que se muestran en las pantallas de protocolos.
// Están aparte de datos.ts porque los formularios del navegador también los usan.

/** HU-070 CA2: unidades del plazo, mismos valores que valida la API. */
export const UNIDADES_PLAZO = [
  { valor: "MINUTOS", texto: "Minutos" },
  { valor: "HORAS", texto: "Horas" },
  { valor: "DIAS_HABILES", texto: "Días hábiles" },
  { valor: "DIAS", texto: "Días corridos" },
] as const;

const UNIDAD_EN_TEXTO: Record<string, [string, string]> = {
  MINUTOS: ["minuto", "minutos"],
  HORAS: ["hora", "horas"],
  DIAS_HABILES: ["día hábil", "días hábiles"],
  DIAS: ["día corrido", "días corridos"],
};

/** El plazo de un paso en palabras, por ejemplo "3 días hábiles". */
export function textoPlazo(valor: number | null, unidad: string | null) {
  if (valor === null || !unidad) return "Sin plazo";
  const [uno, varios] = UNIDAD_EN_TEXTO[unidad] ?? [unidad, unidad];
  return `${valor} ${valor === 1 ? uno : varios}`;
}

/** Estados de una versión del protocolo. */
export const NOMBRE_ESTADO_VERSION: Record<string, string> = {
  BORRADOR: "Borrador",
  PUBLICADO: "Publicada",
  ARCHIVADO: "Archivada",
};

// Mismos límites que valida la API (protocolos/protocolo.ts).
export const LARGOS = {
  codigo: 50,
  nombre: 220,
  notas: 4000,
  nombrePaso: 180,
  descripcionPaso: 4000,
  ordenPaso: 999,
};
