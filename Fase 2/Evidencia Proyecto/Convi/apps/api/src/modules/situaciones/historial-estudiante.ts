import { BadRequestException } from '@nestjs/common';

// PB-074 (HU-064): filtros y orden del historial de un estudiante. Viven aparte
// del servicio para poder probarlos sin base de datos.

export const ESTADOS_SITUACION = [
  'NUEVA',
  'EN_REVISION',
  'INFORMACION_SOLICITADA',
  'ANTECEDENTE',
  'DESCARTADA',
  'VINCULADA_CASO',
] as const;

export const ESTADOS_CASO = [
  'EN_ANALISIS',
  'EN_REVISION',
  'EN_INTERVENCION',
  'EN_SEGUIMIENTO',
  'CERRADO',
  'REABIERTO',
] as const;

export type TipoRegistro = 'SITUACION' | 'CASO';

export type FiltroHistorial = {
  /** Solo situaciones o solo casos; null trae los dos. */
  tipo: TipoRegistro | null;
  /** Estado dentro del tipo elegido; null trae todos. */
  estado: string | null;
  /** Días AAAA-MM-DD de la escuela, ambos incluidos (CA3). */
  desde: string | null;
  hasta: string | null;
  /** Más recientes primero salvo que se pida lo contrario. */
  orden: 'desc' | 'asc';
};

/** Lo que tienen en común una situación y un caso del historial. */
export type RegistroOrdenable = {
  tipo: TipoRegistro;
  estado: string;
  /** Día del hecho (o del inicio del caso) en la zona horaria de la escuela. */
  fecha_dia: string;
  fecha_hecho: Date;
  fecha_registro: Date;
  codigo: string;
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

// Un día real del calendario: 2026-02-30 no pasa.
function esDia(valor: string) {
  if (!DIA.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function invalido(errores: Record<string, string>) {
  return new BadRequestException({
    mensaje: 'Revisa los filtros marcados.',
    errores,
  });
}

/**
 * CA3: el estado llega como SITUACION, CASO, SITUACION:NUEVA o CASO:CERRADO,
 * porque situaciones y casos comparten algunos nombres (En revisión). El
 * período se compara con el día del hecho en la hora de la escuela.
 */
export function validarFiltroHistorial(consulta: {
  estado?: unknown;
  desde?: unknown;
  hasta?: unknown;
  orden?: unknown;
}): FiltroHistorial {
  const errores: Record<string, string> = {};

  let tipo: TipoRegistro | null = null;
  let estado: string | null = null;
  const pedido = texto(consulta.estado);
  if (pedido) {
    const [parteTipo, parteEstado, ...resto] = pedido.split(':');
    const permitidos =
      parteTipo === 'SITUACION'
        ? ESTADOS_SITUACION
        : parteTipo === 'CASO'
          ? ESTADOS_CASO
          : null;
    if (
      !permitidos ||
      resto.length > 0 ||
      (parteEstado !== undefined &&
        !(permitidos as readonly string[]).includes(parteEstado))
    ) {
      errores.estado = 'Elige un estado de la lista.';
    } else {
      tipo = parteTipo as TipoRegistro;
      estado = parteEstado ?? null;
    }
  }

  const desde = texto(consulta.desde) || null;
  const hasta = texto(consulta.hasta) || null;
  if (desde && !esDia(desde)) errores.desde = 'Escribe una fecha válida.';
  if (hasta && !esDia(hasta)) errores.hasta = 'Escribe una fecha válida.';
  if (desde && hasta && !errores.desde && !errores.hasta && hasta < desde)
    errores.hasta = 'La fecha final no puede ser anterior a la inicial.';

  const orden = texto(consulta.orden) || 'desc';
  if (orden !== 'desc' && orden !== 'asc')
    errores.orden = 'Elige un orden de la lista.';

  if (Object.keys(errores).length > 0) throw invalido(errores);
  return { tipo, estado, desde, hasta, orden: orden as 'desc' | 'asc' };
}

/** CA3: deja los registros que cumplen el filtro. */
export function aplicarFiltro<T extends RegistroOrdenable>(
  registros: T[],
  filtro: FiltroHistorial,
): T[] {
  return registros.filter(
    (r) =>
      (!filtro.tipo || r.tipo === filtro.tipo) &&
      (!filtro.estado || r.estado === filtro.estado) &&
      (!filtro.desde || r.fecha_dia >= filtro.desde) &&
      (!filtro.hasta || r.fecha_dia <= filtro.hasta),
  );
}

/**
 * CA1: orden cronológico por la fecha del hecho. Si dos registros ocurrieron
 * al mismo tiempo se ordenan por la fecha de registro y luego por el código,
 * así el orden no cambia entre una visita y otra.
 */
export function ordenarHistorial<T extends RegistroOrdenable>(
  registros: T[],
  orden: 'desc' | 'asc',
): T[] {
  const signo = orden === 'asc' ? 1 : -1;
  return [...registros].sort(
    (a, b) =>
      signo * (a.fecha_hecho.getTime() - b.fecha_hecho.getTime()) ||
      signo * (a.fecha_registro.getTime() - b.fecha_registro.getTime()) ||
      signo * a.codigo.localeCompare(b.codigo),
  );
}

/** Totales por tipo y estado, sin filtros, para mostrarlos junto al filtro. */
export function contarHistorial(registros: RegistroOrdenable[]) {
  const totales = new Map<
    string,
    { tipo: TipoRegistro; estado: string; total: number }
  >();
  for (const r of registros) {
    const clave = `${r.tipo}:${r.estado}`;
    const fila = totales.get(clave) ?? {
      tipo: r.tipo,
      estado: r.estado,
      total: 0,
    };
    fila.total++;
    totales.set(clave, fila);
  }
  return [...totales.values()];
}