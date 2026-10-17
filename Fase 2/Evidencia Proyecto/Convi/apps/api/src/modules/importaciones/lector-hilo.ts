import { parentPort, workerData } from 'node:worker_threads';
import { ArchivoNoValido, leerArchivoDirecto } from './lector.js';

// Se le entrega solo el archivo, sin sesiones ni claves en el entorno.
try {
  const hoja = await leerArchivoDirecto(
    Buffer.from(workerData as Uint8Array),
    'xlsx',
  );
  parentPort?.postMessage({ ok: true, hoja });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    mensaje:
      error instanceof ArchivoNoValido
        ? error.message
        : 'No pudimos leer el archivo. Revisa que sea un XLSX sin contraseña.',
  });
} finally {
  parentPort?.close();
}
