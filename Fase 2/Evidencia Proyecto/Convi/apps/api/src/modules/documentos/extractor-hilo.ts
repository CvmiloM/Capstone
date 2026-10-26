import { parentPort, workerData } from 'node:worker_threads';
import { extraerDirecto, type FormatoDocumento } from './extractor.js';
import { ErrorPreparacion } from './preparacion.js';

try {
  const { contenido, formato } = workerData as {
    contenido: Uint8Array;
    formato: FormatoDocumento;
  };
  parentPort?.postMessage({
    ok: true,
    fragmentos: await extraerDirecto(contenido, formato),
  });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    mensaje:
      error instanceof ErrorPreparacion
        ? error.message
        : 'No pudimos leer el documento, revisa que sea un PDF o Word válido y sin contraseña',
  });
} finally {
  parentPort?.close();
}
