import { BadRequestException } from '@nestjs/common';

// Pestañas de la ficha del caso en el portal de Convivencia. Cada pestaña pide
// solo lo que muestra: cada consulta es un viaje a la base, y en Azure la API y
// Supabase están en regiones distintas.
export const SECCIONES_CASO = [
  'resumen',
  'participantes',
  'situaciones',
  'protocolo',
  'plan',
  'encuentros',
  'compromisos',
  'seguimientos',
  // PB-067 (HU-058): llamadas, conversaciones y otros contactos del caso.
  'comunicaciones',
  'evidencias',
  'ia',
  'historial',
  'estado',
] as const;

export type SeccionCaso = (typeof SECCIONES_CASO)[number];

// Pestañas que muestran cada grupo de datos del detalle. La cabecera de todas
// usa la consulta base y los participantes, por eso esos dos siempre se cargan.
const PESTANAS = {
  situaciones_vinculadas: ['resumen', 'situaciones'],
  evidencias: ['resumen', 'evidencias'],
  protocolos_aplicados: ['resumen', 'protocolo', 'plan'],
  // Protocolos aplicables, revisiones normativas y sus opciones.
  normativa: ['protocolo'],
  // Movimientos, estados, pendientes, actas y responsables para reasignación.
  estado: ['estado'],
  // Planes de intervención y responsables de sus acciones.
  plan: ['plan'],
  // hoy y ahora en la zona horaria de la escuela.
  fechas: [
    'protocolo',
    'plan',
    'encuentros',
    'compromisos',
    'seguimientos',
    'comunicaciones',
  ],
  compromisos_seguimientos: ['resumen', 'compromisos', 'seguimientos'],
  actuaciones_origen: ['compromisos', 'seguimientos'],
  encuentros: ['encuentros'],
  // Responsables y asistentes posibles, que también usa el formulario de seguimientos.
  personas_encuentro: ['encuentros', 'compromisos', 'seguimientos'],
  acciones_encuentro: ['encuentros'],
  // PB-055: cuentas de Convivencia activas que pueden ser responsables de un paso.
  responsables_paso: ['protocolo'],
  // PB-067: comunicaciones del caso y sus destinatarios posibles.
  comunicaciones: ['comunicaciones'],
} satisfies Record<string, readonly SeccionCaso[]>;

export type DatosCaso = keyof typeof PESTANAS;

/** Sin sección se carga todo, como antes; una sección desconocida es un error. */
export function leerSeccionCaso(valor: unknown): SeccionCaso | undefined {
  if (valor === undefined) return undefined;
  const seccion = SECCIONES_CASO.find((s) => s === valor);
  if (!seccion) throw new BadRequestException('Sección no válida.');
  return seccion;
}

/**
 * Devuelve una función que consulta un grupo de datos solo si la sección lo
 * muestra; si no, entrega el valor vacío sin ir a la base.
 */
export function cargadorDeSeccion(seccion: SeccionCaso | undefined) {
  return <T>(datos: DatosCaso, consulta: () => Promise<T>, vacio: T) =>
    seccion === undefined ||
    (PESTANAS[datos] as readonly SeccionCaso[]).includes(seccion)
      ? consulta()
      : Promise.resolve(vacio);
}
