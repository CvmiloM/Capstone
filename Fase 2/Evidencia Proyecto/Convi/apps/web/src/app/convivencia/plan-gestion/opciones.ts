import type { Evidencia } from "@/app/components/evidencias/opciones";

export type Tipo = "planes" | "objetivos" | "acciones" | "actividades";
export const TIPOS: Tipo[] = ["planes", "objetivos", "acciones", "actividades"];
export const RAIZ = "/convivencia/plan-gestion";
export const NOMBRES = {
  planes: "Plan",
  objetivos: "Objetivo",
  acciones: "Acción",
  actividades: "Actividad",
};
export const ESTADOS: Record<string, string> = {
  BORRADOR: "Borrador",
  ACTIVO: "Activo",
  COMPLETADO: "Completado",
  ARCHIVADO: "Archivado",
  PLANIFICADO: "Planificado",
  EN_PROGRESO: "En progreso",
  CANCELADO: "Cancelado",
  VENCIDO: "Vencido",
};
export const rutaDetalle = (tipo: Tipo, id: string) => `${RAIZ}/${tipo}/${id}`;
export type Registro = {
  id: string;
  nombre?: string;
  titulo?: string;
  descripcion?: string | null;
  orden?: number;
  estado?: string;
  anio_academico_id?: string;
  persona_responsable_id?: string;
  responsable?: string;
  publico_objetivo?: string;
  evidencia_esperada?: string;
  nombre_indicador?: string | null;
  unidad_indicador?: string | null;
  meta_indicador?: number | string | null;
  valor_indicador?: number | string | null;
  resumen_resultado?: string | null;
  inicio_programado?: string | null;
  fin_programado?: string | null;
  lugar?: string | null;
  inicio_real?: string | null;
  fin_real?: string | null;
  completado_en?: string | null;
  aprobado_en?: string | null;
  aprobado_por_nombre?: string | null;
  aprobado_fecha?: string | null;
};
export type Detalle = {
  arbol?: { total: number; pagina: number; filas: { id: string; titulo: string; descripcion: string | null; orden: number; acciones_total: number; acciones: { id: string; titulo: string; descripcion: string | null; estado: string; responsable: string | null; actividades_total: number }[] }[] } | null;
  actividades?: { total: number; pagina: number; filas: { id: string; titulo: string; descripcion: string | null; estado: string; responsable: string | null; inicio_programado: string | null }[] } | null;
  registro: Registro;
  version: string;
  plan_id: string;
  plan_nombre: string;
  plan_estado: string;
  anio_academico_id: string;
  anio: number;
  objetivo_id?: string;
  objetivo_titulo?: string;
  accion_id?: string;
  accion_titulo?: string;
  editable: boolean;
  siguiente_orden?: number;
  hoy: string;
  evidencias: { total: number; filas: Evidencia[] };
  vinculados: {
    cursos: { id: string; nombre: string; curso_id: string }[];
    profesionales: {
      id: string;
      nombre: string;
      funcion: string;
      membresia_id: string;
    }[];
  } | null;
};
export type Lista = {
  anios?: number[];
  total: number;
  pagina: number;
  por_pagina: number;
  filas: {
    id: string;
    titulo: string;
    descripcion: string | null;
    estado: string;
    plan_id: string;
    plan_nombre: string;
    anio: number;
    orden: number | null;
    objetivo: string | null;
    accion: string | null;
    inicio_programado?: string | null;
    responsable?: string | null;
    objetivos_total?: number;
    acciones_total?: number;
    actividades_total?: number;
  }[];
};
export type Opciones = {
  total: number;
  filas: { id: string; nombre: string }[];
};
export type EstadoFormulario = {
  valores?: Record<string, string>;
  mensaje?: string;
  errores?: Record<string, string>;
};
export type Operacion =
  "crear" | "agregar" | "editar" | "estado" | "cursos" | "profesionales";
export type ContextoFormulario = {
  operacion: Operacion;
  tipo: Tipo;
  id?: string;
};
