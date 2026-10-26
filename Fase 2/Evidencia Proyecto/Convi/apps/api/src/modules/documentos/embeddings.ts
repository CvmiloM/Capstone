import {
  DIMENSIONES_EMBEDDING,
  ErrorPreparacion,
  MODELO_EMBEDDING,
  type Fragmento,
} from './preparacion.js';

/** Contrato de /api/embed de Ollama, también utilizable detrás de FastAPI. */
export function configuracionEmbeddings() {
  const destino = process.env.IA_EMBEDDINGS_URL?.trim();
  if (!destino)
    throw new ErrorPreparacion(
      'La preparación está pendiente de configurar el servicio de IA, el original sigue disponible',
    );
  let url: URL;
  try {
    url = new URL(destino);
  } catch {
    throw new ErrorPreparacion(
      'La dirección del servicio de IA no está configurada correctamente',
    );
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new ErrorPreparacion(
      'La dirección del servicio de IA no está configurada correctamente',
    );
  const token = process.env.IA_EMBEDDINGS_TOKEN?.trim();
  if (
    process.env.NODE_ENV === 'production' &&
    (url.protocol !== 'https:' || !token)
  )
    throw new ErrorPreparacion(
      'El servicio de IA necesita HTTPS y autenticación antes de utilizarse en producción',
    );
  return { url: url.toString(), token };
}

async function respuestaAcotada(respuesta: Response): Promise<unknown> {
  if (!respuesta.body)
    throw new ErrorPreparacion(
      'El servicio de IA devolvió una respuesta vacía',
      true,
    );
  const lector = respuesta.body.getReader();
  const partes: Uint8Array[] = [];
  let tamano = 0;
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      tamano += value.length;
      if (tamano > 1024 * 1024) {
        await lector.cancel();
        throw new ErrorPreparacion(
          'La respuesta del servicio de IA supera el tamaño permitido',
        );
      }
      partes.push(value);
    }
    return JSON.parse(Buffer.concat(partes).toString('utf8')) as unknown;
  } finally {
    lector.releaseLock();
  }
}

export function validarEmbeddings(
  valor: unknown,
  cantidad: number,
): number[][] {
  const datos = valor as { model?: unknown; embeddings?: unknown } | null;
  const vectores = datos?.embeddings;
  if (
    datos?.model !== MODELO_EMBEDDING ||
    !Array.isArray(vectores) ||
    vectores.length !== cantidad ||
    !vectores.every(
      (vector: unknown) =>
        Array.isArray(vector) &&
        vector.length === DIMENSIONES_EMBEDDING &&
        vector.every(
          (n: unknown) =>
            typeof n === 'number' &&
            Number.isFinite(n) &&
            Math.abs(n) <= 3.4028234663852886e38,
        ) &&
        vector.some((n: number) => n !== 0),
    )
  )
    throw new ErrorPreparacion(
      'El servicio de IA debe devolver un vector válido de 1024 valores por fragmento con el modelo requerido',
    );
  return vectores as number[][];
}

export async function generarEmbeddings(
  fragmentos: Fragmento[],
): Promise<number[][]> {
  const configuracion = configuracionEmbeddings();
  const vectores: number[][] = [];
  for (let inicio = 0; inicio < fragmentos.length; inicio += 8) {
    const lote = fragmentos.slice(inicio, inicio + 8);
    try {
      const respuesta = await fetch(configuracion.url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
        headers: {
          'Content-Type': 'application/json',
          ...(configuracion.token
            ? { Authorization: `Bearer ${configuracion.token}` }
            : {}),
        },
        body: JSON.stringify({
          model: MODELO_EMBEDDING,
          input: lote.map((f) => f.contenido),
          truncate: false,
        }),
      });
      if (!respuesta.ok) {
        await respuesta.body?.cancel();
        throw new ErrorPreparacion(
          respuesta.status === 401 || respuesta.status === 403
            ? 'El servicio de IA rechazó la autenticación, revisa su configuración'
            : 'El servicio de IA no pudo preparar el documento, puedes volver a intentarlo',
          respuesta.status === 429 || respuesta.status >= 500,
        );
      }
      vectores.push(
        ...validarEmbeddings(await respuestaAcotada(respuesta), lote.length),
      );
    } catch (error) {
      if (error instanceof ErrorPreparacion) throw error;
      throw new ErrorPreparacion(
        'No pudimos completar la conexión con el servicio de IA, puedes volver a intentarlo',
        true,
      );
    }
  }
  return vectores;
}
