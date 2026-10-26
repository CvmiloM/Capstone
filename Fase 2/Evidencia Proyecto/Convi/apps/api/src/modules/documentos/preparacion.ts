export const MODELO_EMBEDDING = 'bge-m3:567m-fp16';
export const DIMENSIONES_EMBEDDING = 1024;
export const LIMITE_TEXTO = 1_000_000;
export const LIMITE_FRAGMENTOS = 1500;

export class ErrorPreparacion extends Error {
  constructor(
    mensaje: string,
    readonly recuperable = false,
  ) {
    super(mensaje);
  }
}

export type Pagina = { texto: string; pagina: number | null };
export type Fragmento = {
  indice: number;
  contenido: string;
  pagina_desde: number | null;
  pagina_hasta: number | null;
};

/** Los fragmentos no cruzan páginas, así una cita conserva su ubicación real. */
export function fragmentar(paginas: Pagina[]): Fragmento[] {
  const fragmentos: Fragmento[] = [];
  let caracteres = 0;
  for (const pagina of paginas) {
    const texto = pagina.texto
      .normalize('NFC')
      .split('\0')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    caracteres += texto.length;
    if (caracteres > LIMITE_TEXTO)
      throw new ErrorPreparacion(
        'El documento tiene demasiado texto para prepararlo, divide su contenido en documentos más pequeños',
      );
    for (let inicio = 0; inicio < texto.length;) {
      let fin = Math.min(inicio + 1800, texto.length);
      if (fin < texto.length) {
        const espacio = texto.lastIndexOf(' ', fin);
        if (espacio > inicio + 900) fin = espacio;
      }
      fragmentos.push({
        indice: fragmentos.length,
        contenido: texto.slice(inicio, fin).trim(),
        pagina_desde: pagina.pagina,
        pagina_hasta: pagina.pagina,
      });
      if (fragmentos.length > LIMITE_FRAGMENTOS)
        throw new ErrorPreparacion(
          'El documento genera demasiados fragmentos, divide su contenido en documentos más pequeños',
        );
      if (fin === texto.length) break;
      // Solapamiento breve para conservar el contexto entre fragmentos de la misma página.
      inicio = Math.max(inicio + 1, fin - 180);
      const espacio = texto.indexOf(' ', inicio);
      if (espacio >= inicio && espacio < fin) inicio = espacio + 1;
    }
  }
  if (!fragmentos.length)
    throw new ErrorPreparacion(
      'No encontramos texto seleccionable, si el documento es escaneado sube una copia con texto reconocido',
    );
  return fragmentos;
}
