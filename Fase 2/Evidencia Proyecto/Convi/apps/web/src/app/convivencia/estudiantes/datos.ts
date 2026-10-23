import { NOMBRE_ESTADO, pedir } from "../datos";

// PB-074 (HU-064): datos del historial de los estudiantes. Mismas formas que
// devuelve apps/api/src/modules/situaciones/historial.service.ts; las fechas
// llegan como texto ISO porque viajan en JSON.

export type EstudianteHistorial = {
  id: string;
  codigo_estudiante: string;
  nombres: string;
  apellidos: string;
  rut: string | null;
  estado: string;
  /** Curso y año de la matrícula activa hoy (HU-066 CA2). */
  curso_actual: string | null;
};

export type EstudianteBuscado = EstudianteHistorial & {
  situaciones: number;
  casos: number;
};

export type ListaEstudiantes = {
  estudiantes: EstudianteBuscado[];
  total: number;
  pagina: number;
  por_pagina: number;
};

export type Respaldo = {
  id: string;
  titulo: string;
  tipo: string;
  fecha: string;
  aportado_por: string;
  archivo: string | null;
  tamano_bytes: number | null;
  corrige: boolean;
};

type Comun = {
  id: string;
  codigo: string;
  estado: string;
  /** AAAA-MM-DD del hecho (o del inicio del caso) en la hora de la escuela. */
  fecha_dia: string;
  fecha_hecho: string;
  fecha_registro: string;
  autor: string;
  /** null: «Curso histórico no registrado» (HU-066). */
  curso_al_ocurrir: string | null;
  registro_historico: boolean;
  respaldos: Respaldo[];
};

export type SituacionHistorial = Comun & {
  tipo: "SITUACION";
  categoria: string | null;
  urgencia: string;
  perfil_autor: string;
  rol: string;
  caso: string | null;
};

export type CasoHistorial = Comun & {
  tipo: "CASO";
  titulo: string;
  cerrado_en: string | null;
  situaciones: string[];
};

export type RegistroHistorial = SituacionHistorial | CasoHistorial;

export type Historial = {
  estudiante: EstudianteHistorial;
  registros: RegistroHistorial[];
  conteo: { tipo: "SITUACION" | "CASO"; estado: string; total: number }[];
  total_filtrado: number;
  limite: number;
};

/** Búsqueda por nombre, código o RUT, de a 50. */
export function obtenerEstudiantes(filtro: { buscar: string; pagina: number }) {
  const parametros = new URLSearchParams();
  if (filtro.buscar) parametros.set("buscar", filtro.buscar);
  if (filtro.pagina > 1) parametros.set("pagina", String(filtro.pagina));
  const consulta = parametros.toString();
  return pedir<ListaEstudiantes>(
    `/convivencia/estudiantes${consulta ? `?${consulta}` : ""}`,
  );
}

export type FiltroHistorial = {
  estado: string;
  desde: string;
  hasta: string;
  orden: "desc" | "asc";
};

/** HU-064 CA3: el historial con sus filtros; la API vuelve a validarlos. */
export function obtenerHistorial(id: string, filtro: FiltroHistorial) {
  const parametros = new URLSearchParams();
  if (filtro.estado) parametros.set("estado", filtro.estado);
  if (filtro.desde) parametros.set("desde", filtro.desde);
  if (filtro.hasta) parametros.set("hasta", filtro.hasta);
  if (filtro.orden === "asc") parametros.set("orden", "asc");
  const consulta = parametros.toString();
  return pedir<Historial>(
    `/convivencia/estudiantes/${encodeURIComponent(id)}/historial${consulta ? `?${consulta}` : ""}`,
  );
}

/** Estados del caso con el nombre que usa Convivencia (casos.estado_actual). */
export const ESTADOS_CASO = [
  { valor: "EN_ANALISIS", texto: "En análisis" },
  { valor: "EN_REVISION", texto: "En revisión" },
  { valor: "EN_INTERVENCION", texto: "En intervención" },
  { valor: "EN_SEGUIMIENTO", texto: "En seguimiento" },
  { valor: "CERRADO", texto: "Cerrado" },
  { valor: "REABIERTO", texto: "Reabierto" },
] as const;

export const NOMBRE_ESTADO_CASO: Record<string, string> = Object.fromEntries(
  ESTADOS_CASO.map((e) => [e.valor, e.texto]),
);

/** Nombre del estado de un registro del historial, sea situación o caso. */
export function nombreEstado(registro: { tipo: string; estado: string }) {
  const nombres = registro.tipo === "CASO" ? NOMBRE_ESTADO_CASO : NOMBRE_ESTADO;
  return nombres[registro.estado] ?? registro.estado;
}

/** Tipos de respaldo (evidencias.tipo_evidencia). */
export const NOMBRE_TIPO_RESPALDO: Record<string, string> = {
  DOCUMENTO: "Documento",
  IMAGEN: "Imagen",
  CORREO: "Correo",
  ACTA: "Acta",
  OTRO: "Otro",
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;

// Un día real del calendario, igual que en la API: 2026-02-30 no pasa.
function esDia(valor: string) {
  if (!DIA.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function leer(valor: string | string[] | undefined) {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Lee los filtros de la dirección. Si el período está mal escrito se avisa
 * junto al campo y no se pide nada a la API con ese valor.
 */
export function leerFiltroHistorial(parametros: {
  estado?: string | string[];
  desde?: string | string[];
  hasta?: string | string[];
  orden?: string | string[];
}): { filtro: FiltroHistorial; errores: Record<string, string> } {
  const errores: Record<string, string> = {};
  const estado = leer(parametros.estado);
  const desde = leer(parametros.desde);
  const hasta = leer(parametros.hasta);
  const estadoValido = OPCIONES_ESTADO.some((o) => o.valor === estado);
  if (desde && !esDia(desde)) errores.desde = "Escribe una fecha válida.";
  if (hasta && !esDia(hasta)) errores.hasta = "Escribe una fecha válida.";
  if (desde && hasta && !errores.desde && !errores.hasta && hasta < desde)
    errores.hasta = "La fecha final no puede ser anterior a la inicial.";
  return {
    filtro: {
      estado: estadoValido ? estado : "",
      desde: errores.desde ? "" : desde,
      hasta: errores.desde || errores.hasta ? "" : hasta,
      orden: leer(parametros.orden) === "asc" ? "asc" : "desc",
    },
    errores,
  };
}

/**
 * HU-064 CA3: un solo selector de estado para situaciones y casos. El valor
 * lleva el tipo porque los dos tienen un estado En revisión.
 */
export const OPCIONES_ESTADO: { valor: string; texto: string; grupo: "SITUACION" | "CASO" }[] = [
  { valor: "SITUACION", texto: "Todas las situaciones", grupo: "SITUACION" },
  ...[
    { valor: "NUEVA", texto: "Nueva" },
    { valor: "EN_REVISION", texto: "En revisión" },
    { valor: "INFORMACION_SOLICITADA", texto: "Información solicitada" },
    { valor: "ANTECEDENTE", texto: "Antecedente" },
    { valor: "DESCARTADA", texto: "Descartada" },
    { valor: "VINCULADA_CASO", texto: "Vinculada a caso" },
  ].map((e) => ({
    valor: `SITUACION:${e.valor}`,
    texto: e.texto,
    grupo: "SITUACION" as const,
  })),
  { valor: "CASO", texto: "Todos los casos", grupo: "CASO" },
  ...ESTADOS_CASO.map((e) => ({
    valor: `CASO:${e.valor}`,
    texto: e.texto,
    grupo: "CASO" as const,
  })),
];

const formatoDia = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** «1 jun 2024» a partir de AAAA-MM-DD, sin correr el día por la zona horaria. */
export function formatearDia(dia: string) {
  return formatoDia.format(new Date(`${dia}T00:00:00Z`));
}

/** Tamaño del archivo de un respaldo, como «2 KB» o «1,5 MB». */
export function formatearTamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MB`;
}