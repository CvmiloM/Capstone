import { createHash, randomBytes } from 'node:crypto';
import type { TipoEvento } from './calendario.js';

// Refinamientos de Convivencia, sección 5: suscripción del calendario desde
// Google Calendar u otra aplicación. Reglas sin base de datos: el código del
// enlace, su huella y el archivo iCalendar (RFC 5545).
//
// El archivo sale de CONVI hacia Google, así que lleva lo mínimo: el tipo de
// evento, el código del caso, la fecha y si ya se hizo. Los títulos y las
// descripciones del calendario son texto libre y pueden nombrar a estudiantes,
// por eso nunca se incluyen.

/** 32 bytes al azar en base64url: 43 caracteres. */
const CODIGO = /^[A-Za-z0-9_-]{43}$/;

export function nuevoCodigo(): string {
  return randomBytes(32).toString('base64url');
}

export function codigoValido(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && CODIGO.test(codigo);
}

/** La base guarda solo esta huella, nunca el código. */
export function huellaCodigo(codigo: string): Buffer {
  return createHash('sha256').update(codigo, 'utf8').digest();
}

/** Origen de la web que arma los enlaces de cada evento, solo http o https. */
export function leerOrigen(origen: unknown): string | null {
  if (typeof origen !== 'string' || origen.length > 200) return null;
  try {
    const url = new URL(origen);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export type EventoSuscrito = {
  tipo: TipoEvento;
  origen_id: string;
  caso_id: string | null;
  caso_codigo: string | null;
  tipo_actuacion: string | null;
  estado: string;
  /** Fechas ISO con zona, tal como las entrega jsonb. */
  inicio: string;
  fin: string | null;
  /** AAAA-MM-DD en la zona horaria de la escuela. */
  dia: string;
};

const ACTUACIONES: Record<string, string> = {
  SEGUIMIENTO: 'Seguimiento',
  ENTREVISTA: 'Entrevista',
  REUNION: 'Reunión',
  MEDIACION: 'Mediación',
  INTERVENCION: 'Intervención',
  ACOMPANAMIENTO: 'Acompañamiento',
};

const TERMINADOS = new Set(['REALIZADA', 'COMPLETADO']);

/** Título sin datos personales, por ejemplo «Seguimiento del caso CAS-00012». */
export function tituloEvento(e: EventoSuscrito): string {
  const caso = e.caso_codigo ? ` del caso ${e.caso_codigo}` : '';
  const base =
    e.tipo === 'ACTUACION'
      ? `${ACTUACIONES[e.tipo_actuacion ?? ''] ?? 'Encuentro'}${caso}`
      : e.tipo === 'COMPROMISO'
        ? `Vence un compromiso${caso}`
        : e.tipo === 'PASO_PROTOCOLO'
          ? `Vence un paso de protocolo${caso}`
          : e.tipo === 'ACCION_INTERVENCION'
            ? `Vence una acción de intervención${caso}`
            : 'Actividad del Plan de Gestión';
  return TERMINADOS.has(e.estado) ? `${base} (realizado)` : base;
}

/** Misma ruta que enlaceOrigen del calendario en la web. */
export function rutaEvento(e: EventoSuscrito): string {
  if (e.tipo === 'PLAN_GESTION')
    return `/convivencia/plan-gestion/actividades/${e.origen_id}`;
  if (!e.caso_id) return `/convivencia/calendario?mes=${e.dia.slice(0, 7)}`;
  const caso = `/convivencia/casos/${e.caso_id}`;
  switch (e.tipo) {
    case 'ACTUACION':
      return e.tipo_actuacion === 'SEGUIMIENTO'
        ? `${caso}?seccion=seguimientos#seguimiento-${e.origen_id}`
        : `${caso}?seccion=encuentros#encuentro-${e.origen_id}`;
    case 'COMPROMISO':
      return `${caso}?seccion=compromisos`;
    case 'PASO_PROTOCOLO':
      return `${caso}?seccion=protocolo#paso-${e.origen_id}`;
    default:
      return `${caso}?seccion=plan`;
  }
}

/** Texto de iCalendar: escapa \ ; , y saltos de línea. */
function texto(valor: string): string {
  return valor
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Corta cada línea en 75 bytes como pide la norma, sin partir una letra. */
function plegar(linea: string): string {
  const partes: string[] = [];
  let actual = '';
  let bytes = 0;
  for (const letra of linea) {
    const largo = Buffer.byteLength(letra, 'utf8');
    const limite = partes.length === 0 ? 75 : 74;
    if (bytes + largo > limite) {
      partes.push(actual);
      actual = '';
      bytes = 0;
    }
    actual += letra;
    bytes += largo;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

/** 2026-11-12T13:00:00Z → 20261112T130000Z */
function fechaUtc(fecha: Date): string {
  return fecha
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

const unDiaDespues = (dia: string) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

/**
 * Archivo iCalendar del calendario suscrito. Los encuentros, seguimientos y
 * actividades del Plan de Gestión llevan su hora, los vencimientos
 * (compromisos, pasos y acciones) van como evento de día completo.
 */
export function armarIcs(entrada: {
  eventos: EventoSuscrito[];
  zonaHoraria: string;
  origen: string | null;
  ahora?: Date;
}): string {
  const sello = fechaUtc(entrada.ahora ?? new Date());
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CONVI//Calendario de Convivencia//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:CONVI Convivencia',
    `X-WR-TIMEZONE:${texto(entrada.zonaHoraria)}`,
    'X-WR-CALDESC:Fechas del calendario de Convivencia sin nombres ni descripciones\\, el detalle está en CONVI',
    'REFRESH-INTERVAL;VALUE=DURATION:PT3H',
    'X-PUBLISHED-TTL:PT3H',
  ];
  for (const e of entrada.eventos) {
    const inicio = new Date(e.inicio);
    if (Number.isNaN(inicio.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(e.dia))
      continue;
    const conHora = e.tipo === 'ACTUACION' || e.tipo === 'PLAN_GESTION';
    const fin = e.fin ? new Date(e.fin) : null;
    const url = entrada.origen ? `${entrada.origen}${rutaEvento(e)}` : null;
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${e.tipo}-${e.origen_id}@convi`,
      `DTSTAMP:${sello}`,
    );
    if (conHora) {
      // Sin hora de término se reserva una hora.
      const termino =
        fin && !Number.isNaN(fin.getTime()) && fin > inicio
          ? fin
          : new Date(inicio.getTime() + 3_600_000);
      lineas.push(
        `DTSTART:${fechaUtc(inicio)}`,
        `DTEND:${fechaUtc(termino)}`,
        'TRANSP:OPAQUE',
      );
    } else {
      lineas.push(
        `DTSTART;VALUE=DATE:${e.dia.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${unDiaDespues(e.dia)}`,
        'TRANSP:TRANSPARENT',
      );
    }
    lineas.push(
      `SUMMARY:${texto(tituloEvento(e))}`,
      `DESCRIPTION:${texto(
        'Abre CONVI para ver el detalle, este calendario no muestra nombres ni descripciones' +
          (url ? `\n${url}` : ''),
      )}`,
    );
    if (url) lineas.push(`URL:${url}`);
    lineas.push('STATUS:CONFIRMED', 'END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return lineas.map(plegar).join('\r\n') + '\r\n';
}
