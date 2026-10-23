import { pedir } from "../datos";

// PB-053 (HU-046): casos del portal de Convivencia. Mismas formas que devuelve
// apps/api/src/modules/situaciones/casos.service.ts; las fechas llegan como
// texto ISO porque viajan en JSON.

export type CasoLista = {
  id: string;
  codigo: string;
  titulo: string;
  estado_actual: string;
  /** AAAA-MM-DD. */
  fecha_inicio: string;
  /** AAAA-MM-DD, si la escuela tiene plazo sugerido de cierre (HU-046 CA3). */
  fecha_limite_cierre: string | null;
  categoria: string | null;
  responsable: string;
  situaciones: number;
  estudiantes: number;
};

export type DetalleCaso = CasoLista & {
  resumen: string;
  abierto_por: string;
  abierto_en: string;
  plazo_cierre_dias_aplicado: number | null;
  justificacion_independiente: string | null;
  registro_historico: boolean;
  participantes: {
    estudiante_id: string | null;
    nombres: string;
    apellidos: string;
    codigo_estudiante: string | null;
    rol: string;
    curso_matricula: string | null;
  }[];
  situaciones_vinculadas: {
    id: string;
    codigo: string;
    categoria: string | null;
    ocurrido_en: string;
    vinculado_a_caso_en: string;
  }[];
};

export function obtenerCasos() {
  return pedir<{ casos: CasoLista[]; limite: number }>("/convivencia/casos");
}

export function obtenerCaso(id: string) {
  return pedir<DetalleCaso>(`/convivencia/casos/${encodeURIComponent(id)}`);
}

/** HU-131: estados del caso con el nombre que usa Convivencia. */
export const NOMBRE_ESTADO_CASO: Record<string, string> = {
  EN_ANALISIS: "En análisis",
  EN_REVISION: "En revisión",
  EN_INTERVENCION: "En intervención",
  EN_SEGUIMIENTO: "En seguimiento",
  CERRADO: "Cerrado",
  REABIERTO: "Reabierto",
};

/** Una fecha AAAA-MM-DD como 20-10-2026, sin pasar por la zona horaria. */
export function formatearDia(dia: string) {
  const [anio, mes, diaDelMes] = dia.split("-");
  return `${diaDelMes}-${mes}-${anio}`;
}
