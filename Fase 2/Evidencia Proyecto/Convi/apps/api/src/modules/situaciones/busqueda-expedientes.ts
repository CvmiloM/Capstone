import { BadRequestException } from '@nestjs/common';
import {
  validarFiltroHistorial,
  type TipoRegistro,
} from './historial-estudiante.js';

// PB-077 (HU-067): filtros de la búsqueda de expedientes. Viven aparte del
// servicio para poder probarlos sin base de datos.

export const POR_PAGINA_EXPEDIENTES = 50;
export const LARGO_MAXIMO_CODIGO = 40;
export const LARGO_MAXIMO_ESTUDIANTE = 100;
/** Con 50 por página alcanza para 500 000 expedientes. */
const MAXIMO_PAGINA = 10_000;

export type FiltroExpedientes = {
  /** Parte del código en mayúsculas, como SIT-2026 o 00012; null no filtra. */
  codigo: string | null;
  /** Nombre, código o RUT del estudiante; null no filtra. */
  estudiante: string | null;
  /** Solo situaciones o solo casos; null trae los dos. */
  tipo: TipoRegistro | null;
  /** Estado dentro del tipo elegido; null trae todos (CA3). */
  estado: string | null;
  /** Días AAAA-MM-DD de la escuela, ambos incluidos. */
  desde: string | null;
  hasta: string | null;
  pagina: number;
};

const CODIGO_COMPLETO = /^(SIT|CASO)-(\d{4})-(\d{1,5})$/;

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Un código escrito completo pero sin los ceros, como sit-2026-12, se busca
 * como el código que guarda la base, SIT-2026-00012.
 */
export function normalizarCodigo(valor: string) {
  const codigo = valor.replace(/\s+/g, '').toUpperCase();
  const completo = CODIGO_COMPLETO.exec(codigo);
  if (!completo) return codigo;
  const [, prefijo, anio, numero] = completo;
  return `${prefijo}-${anio}-${numero.padStart(5, '0')}`;
}

/** Texto para ILIKE: los comodines que escriba la persona se buscan como texto. */
export function comoPatron(valor: string) {
  return `%${valor.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * CA1: cada filtro es opcional y se suma a los demás. El estado llega como
 * SITUACION, CASO, SITUACION:NUEVA o CASO:REABIERTO, igual que en el
 * historial del estudiante (PB-074), porque situaciones y casos comparten
 * algunos nombres (En revisión).
 */
export function validarBusquedaExpedientes(consulta: {
  codigo?: unknown;
  estudiante?: unknown;
  estado?: unknown;
  desde?: unknown;
  hasta?: unknown;
  pagina?: unknown;
}): FiltroExpedientes {
  const errores: Record<string, string> = {};

  const codigo = normalizarCodigo(texto(consulta.codigo));
  if (codigo.length > LARGO_MAXIMO_CODIGO)
    errores.codigo = `Escribe hasta ${LARGO_MAXIMO_CODIGO} caracteres.`;
  else if (codigo && !/^[A-Z0-9-]+$/.test(codigo))
    errores.codigo = 'Escribe solo letras, números y guiones.';

  const estudiante = texto(consulta.estudiante).replace(/\s+/g, ' ');
  if (estudiante.length > LARGO_MAXIMO_ESTUDIANTE)
    errores.estudiante = `Escribe hasta ${LARGO_MAXIMO_ESTUDIANTE} caracteres.`;

  // Estado y período con las mismas reglas que el historial del estudiante.
  let periodo: Pick<FiltroExpedientes, 'tipo' | 'estado' | 'desde' | 'hasta'> =
    { tipo: null, estado: null, desde: null, hasta: null };
  try {
    const { tipo, estado, desde, hasta } = validarFiltroHistorial({
      estado: consulta.estado,
      desde: consulta.desde,
      hasta: consulta.hasta,
    });
    periodo = { tipo, estado, desde, hasta };
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const respuesta = error.getResponse() as {
      errores?: Record<string, string>;
    };
    Object.assign(errores, respuesta.errores);
  }

  // Una página fuera de rango vuelve a la primera, como en el historial.
  const numero = Number(texto(consulta.pagina) || '1');
  const pagina =
    Number.isInteger(numero) && numero >= 1 && numero <= MAXIMO_PAGINA
      ? numero
      : 1;

  if (Object.keys(errores).length > 0)
    throw new BadRequestException({
      mensaje: 'Revisa los filtros marcados.',
      errores,
    });
  return {
    codigo: codigo || null,
    estudiante: estudiante || null,
    ...periodo,
    pagina,
  };
}