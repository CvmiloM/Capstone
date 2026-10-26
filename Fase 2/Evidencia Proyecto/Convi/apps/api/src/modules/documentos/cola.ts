import { Queue } from 'bullmq';
import type { Sesion } from '../../common/sesion.js';
import {
  conexionRedis,
  sesionDelTrabajo,
  aTiempo,
} from '../importaciones/cola.js';

export const COLA_DOCUMENTOS = Symbol('COLA_DOCUMENTOS');
export const NOMBRE_COLA_DOCUMENTOS = 'convi-preparacion-documentos';
export type TrabajoDocumento = { version_id: string; sesion: Sesion };
export type ColaDocumentos = Queue<TrabajoDocumento>;

export function crearColaDocumentos(): ColaDocumentos | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const cola = new Queue<TrabajoDocumento>(NOMBRE_COLA_DOCUMENTOS, {
    connection: conexionRedis(url, false),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  });
  // El estado visible se conserva en PostgreSQL, nunca imprimir errores de conexión con secretos.
  cola.on('error', () => {});
  return cola;
}

export function encolarDocumento(
  cola: ColaDocumentos | null,
  sesion: Sesion,
  versionId: string,
) {
  if (!cola) return Promise.reject(new Error('Preparación no disponible'));
  return aTiempo(
    cola.add(
      'preparar',
      { version_id: versionId, sesion: sesionDelTrabajo(sesion) },
      { jobId: `version-${versionId}` },
    ),
    3000,
  );
}
