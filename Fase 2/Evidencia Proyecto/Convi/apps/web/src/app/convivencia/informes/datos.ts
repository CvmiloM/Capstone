export type OpcionInforme = { id: string; nombre: string };
export type OpcionesInforme = { cursos: OpcionInforme[]; categorias: OpcionInforme[]; niveles: OpcionInforme[]; hoy: string };
export type TipoInforme = "PERIODO" | "ESTUDIANTE" | "CASO";
export type AlcanceInforme = {
  tipo: TipoInforme; desde: string; hasta: string; curso: string | null; categoria: string | null;
  estudiante: string | null; caso: string | null; nivel: string | null; anterior: string | null;
};
export type PresentacionInforme = {
  titulo: string; subtitulo: string; comentarios: string; tema: "azul" | "verde";
  portada: boolean; tablas: boolean; agrupacion: "mes" | "dia"; secciones: string[];
  /** Posiciones de los hallazgos que se quitaron, las ediciones anteriores no lo tienen. */
  hallazgos_omitidos?: number[];
};
/** Advertencia fija de la lectura del período, igual que AVISO_HALLAZGOS de la API. */
export const AVISO_HALLAZGOS = "Las cifras describen registros disponibles al momento del cálculo, no determinan causas ni predicen la conducta de estudiantes";
/** Hallazgos con su posición, sin la advertencia que las ediciones anteriores guardaban al final. */
export function hallazgosConPosicion(hallazgos: string[]) {
  return hallazgos.map((texto, posicion) => ({ texto, posicion })).filter(h => h.texto !== AVISO_HALLAZGOS);
}
export type SeccionInforme = {
  id: string; titulo: string; descripcion: string; columnas: string[];
  filas: (string | number | null)[][]; grafico: "barras" | "lineas" | "matriz" | null;
};
export type Informe = {
  id: string; estado: "BORRADOR" | "PUBLICADO"; informe_anterior_id: string | null; publicado_en: string | null; revision: string;
  definiciones_calculo: {
    escuela: string; creador: string; creado_en: string; sujeto: string | null;
    alcance: AlcanceInforme; filtros_texto: string[]; presentacion: PresentacionInforme;
    indicadores: { desde: string; hasta: string; calculado_en: string; zona_horaria: string; total_situaciones: number };
    secciones: SeccionInforme[]; hallazgos: string[];
    definiciones: { indicador: string; fecha: string; formula: string; denominador: string }[];
  };
  secciones_elegidas: SeccionInforme[];
};
export const PROPOSITOS: { tipo: TipoInforme; titulo: string; descripcion: string }[] = [
  { tipo: "PERIODO", titulo: "Analizar un período", descripcion: "Revisa la evolución, las categorías y los niveles educativos, identifica cambios entre meses y compara períodos" },
  { tipo: "ESTUDIANTE", titulo: "Informe de estudiante", descripcion: "Reúne sus situaciones, casos y actuaciones en el período, con entrevistas, asistencia y antecedentes seleccionables" },
  { tipo: "CASO", titulo: "Informe de caso", descripcion: "Ordena los antecedentes de un caso, sus situaciones y actuaciones, con estado, entrevistas y resultados al corte" },
];
export const controlInforme = "mt-1.5 block w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
