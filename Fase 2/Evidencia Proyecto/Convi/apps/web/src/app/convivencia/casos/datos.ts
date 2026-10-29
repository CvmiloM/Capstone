import type { Evidencia } from "@/app/components/evidencias/opciones";
import { enviar, pedir, type RevisionNormativa } from "../datos";

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
  /** PB-082 (HU-071 CA1): protocolos aplicados con sus pasos. */
  protocolos_aplicados: {
    id: string;
    protocolo: string;
    codigo: string;
    numero_version: number;
    estado: string;
    fundamento: string;
    aplicado_por: string;
    aplicado_en: string;
    pasos: {
      id: string;
      orden_paso: number;
      nombre: string;
      descripcion: string | null;
      estado: string;
      vence_en: string | null;
      requiere_evidencia: boolean;
      es_obligatorio: boolean;
      responsable: string | null;
    }[];
  }[];
  /** Versiones publicadas y vigentes que se pueden aplicar hoy. */
  protocolos_aplicables: { id: string; nombre: string; pasos: number }[];
  /** HU-071 CA2 y CA3: revisiones del caso sin protocolo. */
  revisiones_normativas: RevisionNormativa[];
  opciones_normativa: {
    protocolos: { id: string; nombre: string }[];
    documentos: { id: string; nombre: string }[];
  };
  /** PB-061 y PB-062 (HU-054): planes de intervención con sus acciones. */
  planes_intervencion: PlanIntervencion[];
  /** Personas que pueden ser responsables de una acción del plan. */
  responsables_accion: { id: string; nombre: string; perfiles: string[] }[];
  /** AAAA-MM-DD en la zona horaria de la escuela. */
  hoy: string;
};

export type AccionPlan = {
  id: string;
  descripcion: string;
  persona_responsable_id: string;
  responsable: string;
  /** AAAA-MM-DD en la zona horaria de la escuela. */
  vence_dia: string;
  estado: string;
  /** Sigue abierta y ya pasó su día de vencimiento. */
  vencida: boolean;
  notas: string | null;
  completado_dia: string | null;
  creado_en: string;
  motivo_cancelacion: string | null;
  /** CA4: correcciones registradas y el motivo de la última. */
  correcciones: number;
  ultima_correccion: string | null;
  /** Huella de lo que se ve, para rechazar cambios sobre datos viejos (PB-139). */
  version: string;
};

export type PlanIntervencion = {
  id: string;
  objetivo: string;
  estado: string;
  creado_por: string;
  creado_en: string;
  protocolo_caso_id: string | null;
  protocolo: string | null;
  /** CA5: fecha y motivo de término, si se completó o canceló. */
  terminado_en: string | null;
  motivo_termino: string | null;
  version: string;
  acciones: AccionPlan[];
};

export function obtenerCasos() {
  return pedir<{ casos: CasoLista[]; limite: number }>("/convivencia/casos");
}

export function obtenerCaso(id: string) {
  return pedir<DetalleCaso>(`/convivencia/casos/${encodeURIComponent(id)}`);
}

// PB-061 y PB-062 (HU-054): la API vuelve a validar todo.

export function enviarNuevoPlan(casoId: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/casos/${encodeURIComponent(casoId)}/planes`,
    cuerpo,
  );
}

export function enviarEstadoPlan(planId: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/planes/${encodeURIComponent(planId)}/estado`,
    cuerpo,
  );
}

export function enviarNuevaAccionPlan(planId: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/planes/${encodeURIComponent(planId)}/acciones`,
    cuerpo,
  );
}

export function enviarAvanceAccionPlan(accionId: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/acciones-plan/${encodeURIComponent(accionId)}/estado`,
    cuerpo,
  );
}

export function enviarCorreccionAccionPlan(accionId: string, cuerpo: unknown) {
  return enviar(
    "PATCH",
    `/convivencia/acciones-plan/${encodeURIComponent(accionId)}`,
    cuerpo,
  );
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
