import type { Evidencia } from "@/app/components/evidencias/opciones";
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
    /** HU-045 CA2: quién la vinculó y con qué fundamento. */
    vinculado_por: string;
    fundamento_vinculacion: string | null;
  }[];
  cerrado_en: string | null;
  /** HU-131 CA1: historial de estados, del más antiguo al más reciente. */
  movimientos: {
    id: string;
    estado_anterior: string | null;
    estado_nuevo: string;
    motivo: string;
    cambiado_por: string;
    cambiado_en: string;
    resumen_cierre: string | null;
    justificacion_pendientes: string | null;
    acta: string | null;
  }[];
  /** HU-131 CA3: el último movimiento que se ve; cambiar sobre otro se rechaza. */
  ultimo_movimiento_id: string | null;
  /** HU-131 CA5: estados intermedios a los que puede pasar ahora. */
  estados_permitidos: string[];
  puede_cerrar: boolean;
  /** HU-047 CA2: tareas sin terminar que obligan a justificar el cierre. */
  pendientes: {
    actuaciones: number;
    compromisos: number;
    acciones_plan: number;
    pasos_protocolo: number;
  };
  /** HU-047 CA1: actas del caso que se pueden adjuntar al cierre. */
  actas_cierre: { id: string; titulo: string; fecha_documento: string }[];
  /** PB-066: evidencias del caso y de sus situaciones vinculadas. */
  evidencias: Evidencia[];
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
