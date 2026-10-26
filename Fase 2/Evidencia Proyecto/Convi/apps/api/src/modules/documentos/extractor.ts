import { Worker } from 'node:worker_threads';
import {
  ErrorPreparacion,
  fragmentar,
  type Fragmento,
  type Pagina,
  LIMITE_TEXTO,
} from './preparacion.js';

export type FormatoDocumento = 'pdf' | 'docx';

/** La extracción no recibe credenciales y tiene un límite de memoria y tiempo. */
export function extraerEnHilo(
  contenido: Buffer,
  formato: FormatoDocumento,
): Promise<Fragmento[]> {
  return new Promise((resolver, rechazar) => {
    const hilo = new Worker(new URL('./extractor-hilo.js', import.meta.url), {
      workerData: { contenido: new Uint8Array(contenido), formato },
      env: {},
      execArgv: [],
      stdout: true,
      stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 192 },
    });
    // Los avisos del lector pueden contener texto del documento, no enviarlos al registro de la API.
    hilo.stdout?.resume();
    hilo.stderr?.resume();
    let resultado:
      | { ok: true; fragmentos: Fragmento[] }
      | { ok: false; mensaje: string }
      | undefined;
    const plazo = setTimeout(() => {
      void hilo.terminate();
      rechazar(
        new ErrorPreparacion(
          'La lectura del documento tardó demasiado, intenta con una copia más pequeña',
        ),
      );
    }, 60_000);
    hilo.once('message', (valor: typeof resultado) => {
      resultado = valor;
    });
    hilo.once('error', () => {
      clearTimeout(plazo);
      rechazar(
        new ErrorPreparacion(
          'No pudimos leer el documento con los recursos disponibles, intenta con una copia más pequeña',
        ),
      );
    });
    hilo.once('exit', (codigo) => {
      clearTimeout(plazo);
      if (codigo !== 0 || !resultado)
        rechazar(
          new ErrorPreparacion('No pudimos completar la lectura del documento'),
        );
      else if (resultado.ok) resolver(resultado.fragmentos);
      else rechazar(new ErrorPreparacion(resultado.mensaje));
    });
  });
}

export async function extraerDirecto(
  contenido: Uint8Array,
  formato: FormatoDocumento,
): Promise<Fragmento[]> {
  const paginas: Pagina[] = [];
  if (formato === 'pdf') {
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(contenido, {
      useSystemFonts: false,
      stopAtErrors: true,
      verbosity: 0,
    });
    try {
      if (pdf.numPages > 1000)
        throw new ErrorPreparacion(
          'El PDF tiene demasiadas páginas para prepararlo, divide su contenido',
        );
      let total = 0;
      for (let numero = 1; numero <= pdf.numPages; numero++) {
        const pagina = await pdf.getPage(numero);
        const datos = await pagina.getTextContent();
        const texto = datos.items
          .map((item) =>
            'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '',
          )
          .join('');
        total += texto.length;
        if (total > LIMITE_TEXTO)
          throw new ErrorPreparacion(
            'El documento tiene demasiado texto para prepararlo, divide su contenido',
          );
        paginas.push({ texto, pagina: numero });
        pagina.cleanup();
      }
    } finally {
      await pdf.loadingTask.destroy();
    }
  } else {
    const { extractRawText } = await import('mammoth');
    const resultado = await extractRawText({ buffer: Buffer.from(contenido) });
    // Word no conserva páginas estables, no fabricar números para futuras citas.
    paginas.push({ texto: resultado.value, pagina: null });
  }
  return fragmentar(paginas);
}
