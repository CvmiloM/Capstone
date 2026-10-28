import { errorDeCampos, esUuid, fechaValida, objeto, texto } from './curso.js';

// PB-022 y PB-031 (HU-017 y HU-024): movimientos que terminan la matrícula
// vigente de un estudiante. Se validan aquí aunque el formulario también lo
// haga: una petición directa no puede saltarse estas reglas.

export const TIPOS_MOVIMIENTO = [
  'TRASLADO',
  'PROMOCION',
  'EGRESO',
  'RETIRO',
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

/** Estado con que termina la matrícula vigente en cada movimiento. */
export const ESTADO_TERMINO: Record<TipoMovimiento, string> = {
  TRASLADO: 'TRASLADADO',
  PROMOCION: 'COMPLETADO',
  EGRESO: 'COMPLETADO',
  RETIRO: 'RETIRADO',
};

/** Estado del estudiante cuando deja la escuela; en los demás sigue Activo. */
export const ESTADO_ESTUDIANTE: Partial<Record<TipoMovimiento, string>> = {
  EGRESO: 'EGRESADO',
  RETIRO: 'INACTIVO',
};

export const LARGO_MAXIMO_MOTIVO = 500;
export const MENSAJE_MOVIMIENTO =
  'Revisa los datos marcados. No se guardó el cambio de matrícula.';

export type Movimiento = {
  tipo: TipoMovimiento;
  /** La matrícula vigente que vio el administrador (PB-139). */
  matricula_id: string;
  /** Curso de destino; solo al cambiar de curso o pasar de año. */
  curso_id: string | null;
  /** AAAA-MM-DD: inicio en el curso nuevo, o último día si egresa o se retira. */
  fecha: string;
  motivo: string | null;
};

/** El cambio de curso y el paso de año abren una matrícula nueva. */
export function abreMatricula(tipo: TipoMovimiento) {
  return tipo === 'TRASLADO' || tipo === 'PROMOCION';
}

export function validarMovimiento(cuerpo: unknown): Movimiento {
  const datos = objeto(cuerpo);
  const matricula = texto(datos.matricula_id).toLowerCase();
  if (!esUuid(matricula))
    throw errorDeCampos(
      {},
      'No sabemos qué matrícula cambiar. Recarga la página e inténtalo de nuevo.',
    );

  const errores: Record<string, string> = {};
  const tipo = texto(datos.tipo).toUpperCase() as TipoMovimiento;
  const conocido = TIPOS_MOVIMIENTO.includes(tipo);
  if (!conocido) errores.tipo = 'Elige qué cambio vas a registrar.';

  const cursoId = texto(datos.curso_id).toLowerCase();
  if (conocido && abreMatricula(tipo) && !esUuid(cursoId))
    errores.curso_id = 'Elige el curso de destino.';

  const fecha = texto(datos.fecha);
  if (!fechaValida(fecha)) errores.fecha = 'Ingresa una fecha válida.';

  if (datos.motivo != null && typeof datos.motivo !== 'string')
    errores.motivo = 'Escribe el motivo como texto.';
  const motivo = texto(datos.motivo);
  if (motivo.length > LARGO_MAXIMO_MOTIVO)
    errores.motivo = `Usa como máximo ${LARGO_MAXIMO_MOTIVO} caracteres.`;

  if (Object.keys(errores).length > 0)
    throw errorDeCampos(errores, MENSAJE_MOVIMIENTO);
  return {
    tipo,
    matricula_id: matricula,
    curso_id: abreMatricula(tipo) ? cursoId : null,
    fecha,
    motivo: motivo || null,
  };
}

/** 2027-03-01 → 2027-02-28, en UTC para que la zona horaria no cambie el día. */
export function diaAnterior(fecha: string) {
  const dia = new Date(`${fecha}T00:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() - 1);
  return dia.toISOString().slice(0, 10);
}

/**
 * Último día de la matrícula vigente. La base no acepta dos matrículas que
 * compartan un día: al cambiar de curso termina el día antes del primero en
 * el curso nuevo; al pasar de año, el último día de su año o, si eso es
 * después, el día antes del nuevo inicio; al egresar o retirarse, la fecha
 * indicada.
 */
export function terminoMatricula(
  tipo: TipoMovimiento,
  fecha: string,
  finAnio: string | null,
) {
  if (!abreMatricula(tipo)) return fecha;
  const anterior = diaAnterior(fecha);
  return tipo === 'PROMOCION' && finAnio && finAnio < anterior
    ? finAnio
    : anterior;
}
