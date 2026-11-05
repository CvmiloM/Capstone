import type { PoolClient } from 'pg';
import {
  CONSULTA_INDICADORES,
  type FiltrosIndicadores,
} from './indicadores.js';

export type GrupoIndicador = { nombre: string; total: number }[];
export type EstadoIndicador = {
  total: number;
  vencidos: number;
  pendientes: number;
  completados: number;
  cancelados: number;
};
export type IndicadoresCalculados = {
  desde: string;
  hasta: string;
  calculado_en: string;
  zona_horaria: string;
  total_situaciones: number;
  comparacion: {
    desde: string;
    hasta: string;
    dias: number;
    indicadores: {
      nombre: string;
      actual: number;
      anterior: number;
      variacion_porcentual: number | null;
    }[];
  };
  gestion: { casos_cerrados: number; dias_promedio: number | null };
  movimientos: {
    cierres: number;
    casos_con_cierre: number;
    reaperturas: number;
    casos_reabiertos: number;
  };
  por_dia: { fecha: string; total: number }[];
  por_mes: { mes: string; total: number }[];
  por_categoria: GrupoIndicador;
  por_curso: GrupoIndicador;
  por_lugar: GrupoIndicador;
  por_nivel: GrupoIndicador;
  categorias_por_mes: { mes: string; nombre: string; total: number }[];
  compromisos: EstadoIndicador;
  seguimientos: EstadoIndicador;
  cierres: {
    total: number;
    con_plazo: number;
    sin_plazo: number;
    oportunos: number;
    porcentaje_oportunos: number | null;
  };
  opciones: {
    cursos: { id: string; nombre: string }[];
    categorias: { id: string; nombre: string }[];
  };
};

export const DEFINICIONES_INDICADORES = [
  {
    indicador: 'Situaciones',
    fecha: 'Fecha del hecho ocurrido_en en la zona horaria de la escuela',
    formula: 'Conteo de situaciones distintas, incluye todos los estados',
    denominador:
      'Cada situación cuenta una vez, aunque tenga varios participantes',
  },
  {
    indicador: 'Distribuciones',
    fecha: 'Fecha del hecho dentro del período inclusivo',
    formula:
      'Conteo por día, mes, categoría, curso, nivel o lugar, los no informados se conservan como grupo',
    denominador:
      'Total de situaciones del período y alcance elegidos, cantidades absolutas, no tasas por matrícula',
  },
  {
    indicador: 'Compromisos',
    fecha: 'Fecha de vencimiento vence_en dentro del período',
    formula:
      'Estados actuales, vencido si no está completado ni cancelado y el vencimiento ya pasó',
    denominador:
      'Todos los compromisos con vencimiento en el período y alcance elegidos',
  },
  {
    indicador: 'Seguimientos',
    fecha: 'Fecha programada programado_en dentro del período',
    formula:
      'Estados actuales, pendiente si está planificado o pospuesto y aún no vence, vencido si su fecha ya pasó',
    denominador:
      'Actuaciones de tipo seguimiento programadas en el período y alcance elegidos',
  },
  {
    indicador: 'Cierres oportunos',
    fecha: 'Último cerrado_en de casos actualmente cerrados dentro del período',
    formula:
      '100 × cierres cuya fecha es menor o igual al plazo guardado / cierres con plazo, redondeo al entero más cercano',
    denominador:
      'Casos actualmente cerrados con plazo, excluye sin plazo, sin denominador el porcentaje es nulo',
  },
  {
    indicador: 'Tiempo de gestión',
    fecha: 'Último cerrado_en de casos actualmente cerrados dentro del período',
    formula:
      'Promedio de cerrado_en menos abierto_en en días calendario locales, redondeado a un decimal, incluye días previos a reaperturas',
    denominador:
      'Casos actualmente cerrados cuyo último cierre corresponde al período, sin casos el promedio es nulo',
  },
  {
    indicador: 'Comparación',
    fecha:
      'Período anterior adyacente con igual cantidad inclusiva de días calendario',
    formula:
      '100 × (actual − anterior) / anterior, redondeado a un decimal, anterior cero produce No calculable',
    denominador:
      'Conteo anterior del mismo indicador y alcance, situaciones por fecha del hecho, cierres y reaperturas por fecha del movimiento',
  },
  {
    indicador: 'Cierres y reaperturas',
    fecha: 'cambiado_en del historial de estados dentro del período',
    formula:
      'Cada movimiento CERRADO o REABIERTO cuenta, se informan también casos distintos',
    denominador:
      'Movimientos del historial, un caso puede aportar más de un movimiento',
  },
  {
    indicador: 'Filtros de casos',
    fecha: 'El criterio de fecha depende del indicador anterior',
    formula:
      'Curso y categoría seleccionan casos con al menos una situación vinculada coincidente con cada filtro, nivel según el curso contextual, estados al momento del cálculo',
    denominador:
      'Casos del alcance autorizado, nunca participantes ni matrículas',
  },
] as const;

// Panel, exportaciones y explicaciones parten de la misma consulta y del mismo corte transaccional.
export async function leerIndicadores(
  db: PoolClient,
  filtros: FiltrosIndicadores,
  alcance: {
    estudiante?: string | null;
    caso?: string | null;
    nivel?: string | null;
  } = {},
) {
  const { rows } = await db.query<IndicadoresCalculados>(CONSULTA_INDICADORES, [
    filtros.desde,
    filtros.hasta,
    filtros.curso,
    filtros.categoria,
    alcance.estudiante ?? null,
    alcance.caso ?? null,
    alcance.nivel ?? null,
  ]);
  return {
    ...rows[0],
    definiciones: DEFINICIONES_INDICADORES,
    filtros: { curso: filtros.curso, categoria: filtros.categoria },
  };
}
