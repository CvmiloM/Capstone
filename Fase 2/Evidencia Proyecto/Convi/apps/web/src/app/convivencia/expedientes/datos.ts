import { pedir } from "../datos";
import { leerFiltroHistorial } from "../estudiantes/datos";

// PB-077 (HU-067): datos de la búsqueda de expedientes. Mismas formas que
// devuelve apps/api/src/modules/situaciones/expedientes.service.ts; las fechas
// llegan como texto ISO porque viajan en JSON.

type Comun = {
  id: string;
  codigo: string;
  estado: string;
  /** AAAA-MM-DD del hecho (o del inicio del caso) en la hora de la escuela. */
  fecha_dia: string;
  fecha_hecho: string;
  fecha_registro: string;
  registro_historico: boolean;
  estudiantes: string[];
  /** HU-067 CA3: curso y año de sus estudiantes, todos si son varios. */
  cursos: string[];
  /** Algún estudiante no tenía matrícula ese día (HU-066). */
  curso_sin_registro: boolean;
};

export type SituacionEncontrada = Comun & {
  tipo: "SITUACION";
  categoria: string | null;
  urgencia: string;
  caso: { id: string; codigo: string } | null;
};

export type CasoEncontrado = Comun & {
  tipo: "CASO";
  titulo: string;
  categoria: string | null;
  responsable: string;
  situaciones: number;
  cerrado_en: string | null;
};

export type ExpedienteEncontrado = SituacionEncontrada | CasoEncontrado;

export type ResultadoBusqueda = {
  resultados: ExpedienteEncontrado[];
  total: number;
  conteo: { tipo: "SITUACION" | "CASO"; estado: string; total: number }[];
  pagina: number;
  por_pagina: number;
};

export type FiltroExpedientes = {
  codigo: string;
  estudiante: string;
  estado: string;
  desde: string;
  hasta: string;
  pagina: number;
};

export const LARGO_MAXIMO_CODIGO = 40;
export const LARGO_MAXIMO_ESTUDIANTE = 100;

function leer(valor: string | string[] | undefined) {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Lee los filtros de la dirección con las mismas reglas que la API. Un filtro
 * mal escrito se avisa junto a su campo y no se envía a la API.
 */
export function leerFiltroExpedientes(parametros: {
  codigo?: string | string[];
  estudiante?: string | string[];
  estado?: string | string[];
  desde?: string | string[];
  hasta?: string | string[];
  pagina?: string | string[];
}): { filtro: FiltroExpedientes; errores: Record<string, string> } {
  // Estado y período igual que en el historial del estudiante (PB-074).
  const { filtro: periodo, errores } = leerFiltroHistorial(parametros);

  const codigo = leer(parametros.codigo).replace(/\s+/g, "").toUpperCase();
  if (codigo.length > LARGO_MAXIMO_CODIGO)
    errores.codigo = `Escribe hasta ${LARGO_MAXIMO_CODIGO} caracteres.`;
  else if (codigo && !/^[A-Z0-9-]+$/.test(codigo))
    errores.codigo = "Escribe solo letras, números y guiones.";

  const estudiante = leer(parametros.estudiante).replace(/\s+/g, " ");
  if (estudiante.length > LARGO_MAXIMO_ESTUDIANTE)
    errores.estudiante = `Escribe hasta ${LARGO_MAXIMO_ESTUDIANTE} caracteres.`;

  const numero = Number(leer(parametros.pagina) || "1");
  return {
    filtro: {
      codigo: errores.codigo ? "" : codigo,
      estudiante: errores.estudiante ? "" : estudiante,
      estado: periodo.estado,
      desde: periodo.desde,
      hasta: periodo.hasta,
      pagina: Number.isInteger(numero) && numero >= 1 && numero <= 10_000 ? numero : 1,
    },
    errores,
  };
}

/** La dirección de la búsqueda con estos filtros, sin los vacíos. */
export function direccionBusqueda(filtro: FiltroExpedientes) {
  const parametros = new URLSearchParams();
  if (filtro.codigo) parametros.set("codigo", filtro.codigo);
  if (filtro.estudiante) parametros.set("estudiante", filtro.estudiante);
  if (filtro.estado) parametros.set("estado", filtro.estado);
  if (filtro.desde) parametros.set("desde", filtro.desde);
  if (filtro.hasta) parametros.set("hasta", filtro.hasta);
  if (filtro.pagina > 1) parametros.set("pagina", String(filtro.pagina));
  const consulta = parametros.toString();
  return consulta ? `?${consulta}` : "";
}

/** HU-067 CA1: la API vuelve a validar cada filtro. */
export function obtenerExpedientes(filtro: FiltroExpedientes) {
  return pedir<ResultadoBusqueda>(`/convivencia/expedientes${direccionBusqueda(filtro)}`);
}