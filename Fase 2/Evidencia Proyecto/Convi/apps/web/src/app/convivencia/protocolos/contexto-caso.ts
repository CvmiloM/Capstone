const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function casoDeOrigen(valor: unknown) {
  return typeof valor === "string" && UUID.test(valor) ? valor : undefined;
}

export function conCaso(ruta: string, casoId: string | undefined) {
  return casoId ? ruta + (ruta.includes("?") ? "&" : "?") + "caso=" + casoId : ruta;
}

export function volverAlCaso(casoId: string) {
  return "/convivencia/casos/" + casoId + "?seccion=protocolo";
}
