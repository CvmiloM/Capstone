import { enviar, pedir } from "../datos";

// PB-081 y PB-083: protocolos del portal de Convivencia. Mismas formas que
// devuelve apps/api/src/modules/protocolos/protocolos.service.ts; las fechas
// llegan como texto porque viajan en JSON.

export type ProtocoloLista = {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  versiones: number;
  version_publicada: number | null;
  /** AAAA-MM-DD. */
  vigente_desde: string | null;
  borrador_id: string | null;
  borrador_numero: number | null;
};

export type VersionProtocolo = {
  id: string;
  numero_version: number;
  estado: string;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  publicado_en: string | null;
  revisado_por: string | null;
  version_documento_origen_id: string | null;
  documento_origen: string | null;
  notas: string | null;
  creado_por: string;
  creado_en: string;
  pasos: number;
};

export type DetalleProtocolo = {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  borrador_id: string | null;
  versiones: VersionProtocolo[];
};

export type PasoProtocolo = {
  id: string;
  orden_paso: number;
  nombre: string;
  descripcion: string | null;
  valor_plazo: number | null;
  unidad_plazo: string | null;
  requiere_evidencia: boolean;
  es_obligatorio: boolean;
};

export type DetalleVersion = VersionProtocolo & {
  protocolo_id: string;
  protocolo_codigo: string;
  protocolo_nombre: string;
  pasos_detalle: PasoProtocolo[];
  documentos_origen: { id: string; nombre: string }[];
  /** AAAA-MM-DD de hoy en la escuela. */
  hoy: string;
};

export function obtenerProtocolos() {
  return pedir<ProtocoloLista[]>("/convivencia/protocolos");
}

export function obtenerProtocolo(id: string) {
  return pedir<DetalleProtocolo>(
    `/convivencia/protocolos/${encodeURIComponent(id)}`,
  );
}

export function obtenerVersion(id: string) {
  return pedir<DetalleVersion>(
    `/convivencia/versiones-protocolo/${encodeURIComponent(id)}`,
  );
}

/** HU-070 CA1: crea el protocolo con su versión 1 en Borrador. */
export function enviarProtocolo(cuerpo: unknown) {
  return enviar("POST", "/convivencia/protocolos", cuerpo);
}

/** HU-070 CA5: versión nueva en Borrador a partir de la última. */
export function enviarNuevaVersion(protocoloId: string) {
  return enviar(
    "POST",
    `/convivencia/protocolos/${encodeURIComponent(protocoloId)}/versiones`,
  );
}

export function enviarDatosVersion(id: string, cuerpo: unknown) {
  return enviar(
    "PATCH",
    `/convivencia/versiones-protocolo/${encodeURIComponent(id)}`,
    cuerpo,
  );
}

export function enviarPaso(versionId: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/versiones-protocolo/${encodeURIComponent(versionId)}/pasos`,
    cuerpo,
  );
}

export function enviarCambioPaso(pasoId: string, cuerpo: unknown) {
  return enviar(
    "PATCH",
    `/convivencia/pasos-protocolo/${encodeURIComponent(pasoId)}`,
    cuerpo,
  );
}

/** HU-072: publica la versión; el revisor y la fecha los pone el servidor. */
export function enviarPublicacion(id: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/versiones-protocolo/${encodeURIComponent(id)}/publicacion`,
    cuerpo,
  );
}
