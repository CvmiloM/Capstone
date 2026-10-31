import { enviar, pedir } from "../datos";

// PB-093 (HU-080): datos de la bandeja de alertas. Mismas formas que devuelve
// apps/api/src/modules/alertas/atencion.service.ts; las fechas llegan como
// texto ISO y se muestran en la zona horaria de la escuela.

export type AlertaLista = {
  id: string;
  estado: string;
  generada_en: string;
  revisado_en: string | null;
  codigo_regla: string;
  numero_version: number;
  regla: string;
  prioridad: string;
  tipo_regla: string;
  ambito: string;
  /** Estudiante, curso o caso al que se refiere; null es toda la escuela. */
  referencia: string | null;
  formula: string | null;
};

export type PaginaAlertas = {
  alertas: AlertaLista[];
  total: number;
  pagina: number;
  limite: number;
  conteo: Record<string, number>;
  zona_horaria: string;
};

export type DetalleAlerta = AlertaLista & {
  observacion: string | null;
  revisado_por: string | null;
  categoria: string | null;
  /** Lo que guardó el motor de reglas (HU-079 CA3). */
  explicacion: Record<string, unknown>;
  version: string;
  zona_horaria: string;
  estudiante: { id: string; nombre: string; codigo: string } | null;
  curso: { id: string; nombre: string } | null;
  caso: { id: string; codigo: string; titulo: string } | null;
  total_situaciones: number;
  situaciones: {
    id: string;
    codigo: string;
    ocurrido_en: string;
    categoria: string | null;
    estado: string;
  }[];
  vencidos: {
    tipo: string;
    id: string;
    descripcion: string | null;
    vence_en: string | null;
    seguimiento: boolean;
  }[];
};

export function obtenerAlertas(filtros: { estado?: string; pagina?: string }) {
  const parametros = new URLSearchParams();
  if (filtros.estado) parametros.set("estado", filtros.estado);
  if (filtros.pagina) parametros.set("pagina", filtros.pagina);
  const consulta = parametros.toString();
  return pedir<PaginaAlertas>(
    `/convivencia/alertas${consulta ? `?${consulta}` : ""}`,
  );
}

export function obtenerAlerta(id: string) {
  return pedir<DetalleAlerta>(`/convivencia/alertas/${encodeURIComponent(id)}`);
}

/** CA2: Revisada o Archivada, con lo que se hizo y la huella que se veía. */
export function enviarRevisionAlerta(id: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/alertas/${encodeURIComponent(id)}/revision`,
    cuerpo,
  );
}
