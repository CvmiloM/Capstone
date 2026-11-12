// Presupuesto por proceso: cuatro llamadas y una cola FIFO acotada.
const MAXIMO_EN_CURSO = 4;
const MAXIMO_EN_ESPERA = 20;
const ESPERA_MAXIMA_MS = 20_000;
let enCurso = 0;
const cola: { iniciar: () => void }[] = [];

export async function conCapacidadIA<T>(trabajo: () => Promise<T>): Promise<T> {
  if (enCurso >= MAXIMO_EN_CURSO) {
    if (cola.length >= MAXIMO_EN_ESPERA)
      throw new Error('La cola de la IA está completa. Inténtalo nuevamente en unos momentos.');
    await new Promise<void>((resolve, reject) => {
      const turno = { iniciar: () => { clearTimeout(reloj); resolve(); } };
      const reloj = setTimeout(() => {
        const posicion = cola.indexOf(turno);
        if (posicion < 0) return;
        cola.splice(posicion, 1);
        reject(new Error('La IA sigue ocupada y se agotó el tiempo de espera. Inténtalo nuevamente.'));
      }, ESPERA_MAXIMA_MS);
      reloj.unref();
      cola.push(turno);
    });
  } else {
    enCurso++;
  }
  try {
    return await trabajo();
  } finally {
    const siguiente = cola.shift();
    // El cupo pasa al siguiente sin quedar libre para una solicitud recién llegada.
    if (siguiente) siguiente.iniciar();
    else enCurso--;
  }
}

/** Limita los bytes mientras llegan, antes de construir un texto/JSON grande. */
export async function leerTextoIA(respuesta: Response, maximo: number): Promise<string> {
  if (!respuesta.body) throw new Error('La IA devolvió una respuesta vacía.');
  const lector = respuesta.body.getReader();
  const partes: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximo) {
        await lector.cancel();
        throw new Error('La respuesta de la IA supera el tamaño permitido.');
      }
      partes.push(value);
    }
    return Buffer.concat(partes).toString('utf8');
  } finally { lector.releaseLock(); }
}
