import { ErrorIA, MODELO_GENERACION } from './consulta.js';

// PB-118: llamada a POST /api/chat de convi-ia (apps/ia), el mismo contrato de Ollama.
// Usa el mismo token que los embeddings porque es el mismo servicio.

const ESPERA_MS = 120_000;
const MAXIMO_RESPUESTA = 128 * 1024;

export function configuracionGeneracion() {
  const destino = process.env.IA_GENERACION_URL?.trim();
  if (!destino)
    throw new ErrorIA('El servicio de IA no está configurado en la API');
  let url: URL;
  try {
    url = new URL(destino);
  } catch {
    throw new ErrorIA('La dirección del servicio de IA no es válida');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new ErrorIA('La dirección del servicio de IA no es válida');
  const token = process.env.IA_EMBEDDINGS_TOKEN?.trim();
  if (
    process.env.NODE_ENV === 'production' &&
    (url.protocol !== 'https:' || !token)
  )
    throw new ErrorIA(
      'El servicio de IA necesita HTTPS y token antes de usarse en producción',
    );
  return { url: url.toString(), token };
}

type Mensaje = { role: 'system' | 'user'; content: string };

/** Devuelve el texto JSON que redactó el modelo, sin interpretarlo. */
export async function generar(
  mensajes: Mensaje[],
  esquema: Record<string, unknown>,
): Promise<string> {
  const { url, token } = configuracionGeneracion();
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(ESPERA_MS),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: MODELO_GENERACION,
        messages: mensajes,
        format: esquema,
        stream: false,
      }),
    });
  } catch {
    throw new ErrorIA('No hubo conexión con el servicio de IA');
  }
  if (!respuesta.ok) {
    await respuesta.body?.cancel();
    throw new ErrorIA(`El servicio de IA respondió ${respuesta.status}`);
  }
  const texto = await respuesta.text();
  if (texto.length > MAXIMO_RESPUESTA)
    throw new ErrorIA('La respuesta del servicio de IA es demasiado grande');
  let datos: { model?: unknown; message?: { content?: unknown } } | null;
  try {
    datos = JSON.parse(texto) as typeof datos;
  } catch {
    throw new ErrorIA('El servicio de IA no devolvió JSON');
  }
  const contenido = datos?.message?.content;
  if (datos?.model !== MODELO_GENERACION || typeof contenido !== 'string')
    throw new ErrorIA('El servicio de IA no devolvió la respuesta esperada');
  return contenido;
}
