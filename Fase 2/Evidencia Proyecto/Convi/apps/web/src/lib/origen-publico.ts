// Refinamientos de Convivencia, sección 5: origen público de la web (por
// ejemplo https://convi.cl) para armar el enlace del calendario que se pega
// en Google Calendar. Detrás de un proxy, la dirección que usa la persona
// llega en x-forwarded-host y x-forwarded-proto.
export function origenPublico(cabeceras: Headers, respaldo?: string): string | null {
  const host = (cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "")
    .split(",")[0]
    .trim();
  const protocolo = (cabeceras.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  if (host && /^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) {
    const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
    const esquema = protocolo === "http" || protocolo === "https" ? protocolo : local ? "http" : "https";
    return `${esquema}://${host}`;
  }
  if (!respaldo) return null;
  try {
    return new URL(respaldo).origin;
  } catch {
    return null;
  }
}
