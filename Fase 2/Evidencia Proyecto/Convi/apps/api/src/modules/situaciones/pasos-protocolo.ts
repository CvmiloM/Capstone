import { BadRequestException } from '@nestjs/common';
import { esDia } from './plan-intervencion.js';

// PB-055 (HU-048) y PB-056 (HU-049): avance de los pasos del protocolo
// aplicado al caso y término del protocolo. Se valida aquí para responder con
// errores por campo; la base vuelve a exigir el responsable de Convivencia
// activa, la fecha y el autor al completar, el respaldo si el paso lo pide, la
// justificación al omitir y el motivo al completar, cancelar o reabrir.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Huella del registro que se veía (md5 de la fila), para PB-139. */
const VERSION = /^[0-9a-f]{32}$/;

// Decisión del PO (por defecto): mismos largos que el plan de intervención.
export const LARGO_MAXIMO_NOTAS_PASO = 2000;
export const LARGO_MAXIMO_MOTIVO_PROTOCOLO = 500;

/** Estados que se eligen al registrar el avance; Vencido lo da el plazo. */
export const ESTADOS_NUEVOS_PASO = [
  'EN_PROGRESO',
  'COMPLETADO',
  'OMITIDO',
] as const;
/** Estados en que un paso todavía avanza; completado u omitido queda así. */
export const PASO_ABIERTO = ['PENDIENTE', 'EN_PROGRESO', 'VENCIDO'];
export const ESTADOS_PROTOCOLO = ['ACTIVO', 'COMPLETADO', 'CANCELADO'] as const;

export type AvancePaso = {
  estado_nuevo: (typeof ESTADOS_NUEVOS_PASO)[number];
  /** Obligatorias al omitir (CA4); opcionales en lo demás. */
  notas: string | null;
  version: string;
};

export type AsignacionPaso = {
  /** Membresía de Convivencia activa (CA2). */
  responsable_id: string;
  /** AAAA-MM-DD; null si el paso sigue sin plazo. */
  vence_dia: string | null;
  version: string;
};

export type CambioEstadoProtocolo = {
  estado_nuevo: (typeof ESTADOS_PROTOCOLO)[number];
  motivo: string;
  version: string;
};

function datosDe(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function version(valor: unknown) {
  return typeof valor === 'string' && VERSION.test(valor) ? valor : null;
}

function rechazar(mensaje: string, errores: Record<string, string>): never {
  throw new BadRequestException({ mensaje, errores });
}

const RECARGAR = 'Recarga la página e inténtalo nuevamente.';

// CA1, CA3 y CA4: el paso pasa a En progreso, se completa (con notas
// opcionales) o se omite con una justificación en las notas.
export function validarAvancePaso(cuerpo: unknown): AvancePaso {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const estado = ESTADOS_NUEVOS_PASO.find((e) => e === datos.estado_nuevo);
  if (!estado) errores.estado_nuevo = 'Elige el nuevo estado del paso.';
  const notas = texto(datos.notas);
  if (estado === 'OMITIDO' && !notas)
    errores.notas = 'Explica por qué se omite el paso.';
  else if (notas.length > LARGO_MAXIMO_NOTAS_PASO)
    errores.notas = `El texto admite hasta ${LARGO_MAXIMO_NOTAS_PASO} caracteres.`;
  const vista = version(datos.version);
  if (!vista) errores.estado_nuevo = RECARGAR;
  if (!estado || !vista || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. El paso no cambió.', errores);
  return { estado_nuevo: estado, notas: notas || null, version: vista };
}

// CA1 y CA2: responsable y plazo del paso. El servicio revisa que el
// responsable sea de Convivencia activa y que un plazo nuevo no sea pasado.
export function validarAsignacionPaso(cuerpo: unknown): AsignacionPaso {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const responsable = texto(datos.responsable_id);
  if (!UUID.test(responsable))
    errores.responsable_id = 'Elige a la persona responsable del paso.';
  const vence = texto(datos.vence_dia);
  if (vence && !esDia(vence))
    errores.vence_dia = 'Indica una fecha de vencimiento válida.';
  const vista = version(datos.version);
  if (!vista) errores.responsable_id = RECARGAR;
  if (!vista || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. El paso no cambió.', errores);
  return {
    responsable_id: responsable.toLowerCase(),
    vence_dia: vence || null,
    version: vista,
  };
}

// HU-049 CA1 y CA2: completar, cancelar o reabrir el protocolo, siempre con
// un motivo que queda en la auditoría.
export function validarCambioEstadoProtocolo(
  cuerpo: unknown,
): CambioEstadoProtocolo {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const estado = ESTADOS_PROTOCOLO.find((e) => e === datos.estado_nuevo);
  if (!estado) errores.estado_nuevo = 'Elige el nuevo estado del protocolo.';
  const motivo = texto(datos.motivo);
  if (!motivo)
    errores.motivo =
      estado === 'ACTIVO'
        ? 'Explica por qué se reabre el protocolo.'
        : 'Explica por qué termina el protocolo.';
  else if (motivo.length > LARGO_MAXIMO_MOTIVO_PROTOCOLO)
    errores.motivo = `El texto admite hasta ${LARGO_MAXIMO_MOTIVO_PROTOCOLO} caracteres.`;
  const vista = version(datos.version);
  if (!vista) errores.estado_nuevo = RECARGAR;
  if (!estado || !vista || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. El protocolo no cambió.', errores);
  return { estado_nuevo: estado, motivo, version: vista };
}
