export const TIPOS = {
  RICE: "Reglamento interno (RICE)",
  FUENTE_PROTOCOLO: "Fuente de protocolo",
  PLAN: "Plan",
  POLITICA: "Política",
  PLANTILLA: "Plantilla",
  OTRO: "Otro documento",
} as const;
export const ESTADOS: Record<string, string> = {
  BORRADOR: "Borrador",
  PUBLICADO: "Publicada",
  ARCHIVADO: "Archivada",
};
export const COLOR_ESTADO: Record<string, string> = {
  BORRADOR: "bg-destructive/10 text-destructive",
  PUBLICADO: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  ARCHIVADO: "bg-muted text-muted-foreground",
};
export function tamanoArchivo(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  const valor = bytes < 1024 * 1024 ? bytes / 1024 : bytes / 1024 / 1024;
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(valor)} ${bytes < 1024 * 1024 ? "KB" : "MB"}`;
}
export const PROCESAMIENTO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  PROCESANDO: "Procesando",
  LISTO: "Lista",
  FALLIDO: "Fallida",
  NO_APLICA: "No aplica",
};
export type Portal = "admin" | "convivencia";
export function fecha(valor: string | null) {
  if (!valor) return "Sin término";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${valor}T12:00:00Z`));
}
