import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { conexionRedis } from '../importaciones/cola.js';

// PB-090 (HU-079 CA4 y CA8): la evaluación de las reglas de cantidad corre en
// segundo plano, en una cola de BullMQ sobre el mismo Redis de las
// importaciones (PB-027). La situación ya quedó guardada cuando se encola;
// si la evaluación falla, BullMQ la reintenta. Redis solo guarda qué
// situación evaluar: las alertas y su clave única están en la base, así que
// un trabajo repetido no duplica nada.

export const NOMBRE_COLA_REGLAS = 'convi-evaluacion-reglas';

/** La cola, o null si falta REDIS_URL: entonces se evalúa dentro de la API. */
export const COLA_REGLAS = Symbol('COLA_REGLAS');

export type TrabajoReglas = {
  establecimiento_id: string;
  situacion_id: string;
};

export type ColaReglas = Queue<TrabajoReglas>;

/** Un aviso por minuto como máximo mientras Redis no responde, sin datos de la conexión. */
export function avisoSinRedisReglas(logger: Logger) {
  let ultimo = 0;
  return () => {
    if (Date.now() - ultimo < 60000) return;
    ultimo = Date.now();
    logger.error(
      'No hay conexión con Redis: la cola de evaluación de reglas espera.',
    );
  };
}

export function crearColaReglas(): ColaReglas | null {
  const logger = new Logger('ColaReglas');
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn(
      'Falta configurar REDIS_URL: las reglas se evalúan dentro de la API, sin cola.',
    );
    return null;
  }
  const cola = new Queue<TrabajoReglas>(NOMBRE_COLA_REGLAS, {
    connection: conexionRedis(url, false),
    defaultJobOptions: {
      // CA8: un error pasajero de la base se reintenta, con esperas crecientes.
      attempts: 5,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  });
  cola.on('error', avisoSinRedisReglas(logger));
  return cola;
}
