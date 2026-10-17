import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Sesion } from '../../common/sesion.js';

// PB-027 (HU-020 CA5): la confirmación de una importación corre en segundo
// plano, en una cola de BullMQ sobre Redis. La API deja la importación
// Procesando, encola el trabajo y responde al tiro; trabajador.ts la confirma
// por tramos. Redis solo guarda el trabajo: las filas y su avance están en la
// base, así que un trabajo repetido no vuelve a confirmar lo ya confirmado.

export const NOMBRE_COLA = 'convi-confirmacion-importaciones';

/** La cola, o null si falta REDIS_URL: confirmar responde que no está disponible. */
export const COLA_CONFIRMACION = Symbol('COLA_CONFIRMACION');

/**
 * Lo que guarda cada trabajo. La sesión es la que la API comprobó al pedir la
 * confirmación (sin tokens); cada tramo la vuelve a comprobar con
 * CuentaService.operar, así que una cuenta suspendida detiene el trabajo.
 */
export type TrabajoConfirmacion = { importacion_id: string; sesion: Sesion };

export type ColaConfirmacion = Queue<TrabajoConfirmacion>;

/** Solo los datos de la sesión que necesita CuentaService.operar. */
export function sesionDelTrabajo(sesion: Sesion): Sesion {
  return {
    authUsuarioId: sesion.authUsuarioId,
    aal: sesion.aal,
    membresia_id: sesion.membresia_id,
    establecimiento_id: sesion.establecimiento_id,
    codigo_perfil: sesion.codigo_perfil,
    requiere_segundo_factor: sesion.requiere_segundo_factor,
  };
}

/**
 * Conexión a Redis (redis:// en Docker, rediss:// con TLS en la nube). El
 * trabajador espera a Redis sin límite, como exige BullMQ.
 */
export function conexionRedis(url: string, trabajador: boolean) {
  return new Redis(url, { maxRetriesPerRequest: trabajador ? null : 1 });
}

/**
 * Sin conexión, BullMQ espera a Redis sin límite. Lo que hace la API mientras
 * responde al administrador tiene un plazo: si Redis no contesta, falla.
 */
export function aTiempo<T>(promesa: Promise<T>, milisegundos: number) {
  return new Promise<T>((resolver, rechazar) => {
    const plazo = setTimeout(
      () => rechazar(new Error('Redis no respondió a tiempo.')),
      milisegundos,
    );
    promesa.then(
      (valor) => {
        clearTimeout(plazo);
        resolver(valor);
      },
      (error: unknown) => {
        clearTimeout(plazo);
        rechazar(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** Un aviso por minuto como máximo mientras Redis no responde, sin datos de la conexión. */
export function avisoSinRedis(logger: Logger) {
  let ultimo = 0;
  return () => {
    if (Date.now() - ultimo < 60000) return;
    ultimo = Date.now();
    logger.error(
      'No hay conexión con Redis: la cola de confirmaciones espera.',
    );
  };
}

export function crearCola(): ColaConfirmacion | null {
  const logger = new Logger('ColaConfirmacion');
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn(
      'Falta configurar REDIS_URL: la confirmación de importaciones no está disponible.',
    );
    return null;
  }
  const cola = new Queue<TrabajoConfirmacion>(NOMBRE_COLA, {
    connection: conexionRedis(url, false),
    defaultJobOptions: {
      // Un error pasajero de la base se reintenta; las filas ya confirmadas
      // no se repiten. Si los tres intentos fallan, queda el botón Reanudar.
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  });
  cola.on('error', avisoSinRedis(logger));
  return cola;
}