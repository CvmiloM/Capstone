// PB-159 (HU-137 CA2): números al azar que dependen solo de la semilla, para
// que el generador produzca siempre los mismos datos. No usa Math.random ni la
// hora: la misma semilla da la misma secuencia en cualquier equipo.

/** Convierte la semilla en cuatro números de 32 bits (cyrb128). */
function mezclarSemilla(semilla: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < semilla.length; i++) {
    const k = semilla.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

/** Generador sfc32: rápido, de buena calidad y fácil de reproducir. */
export class Azar {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(semilla: string) {
    [this.a, this.b, this.c, this.d] = mezclarSemilla(semilla);
    // Los primeros valores se descartan para que semillas parecidas se separen.
    for (let i = 0; i < 15; i++) this.siguiente();
  }

  /** Número entre 0 (incluido) y 1 (excluido). */
  siguiente(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Entero entre minimo y maximo, ambos incluidos. */
  entero(minimo: number, maximo: number): number {
    return minimo + Math.floor(this.siguiente() * (maximo - minimo + 1));
  }

  /** true con la probabilidad indicada (entre 0 y 1). */
  probabilidad(p: number): boolean {
    return this.siguiente() < p;
  }

  elegir<T>(lista: readonly T[]): T {
    if (lista.length === 0) throw new Error('No hay nada que elegir.');
    return lista[Math.floor(this.siguiente() * lista.length)];
  }

  /** Elige según el peso de cada opción. */
  ponderado<T>(opciones: readonly (readonly [T, number])[]): T {
    const total = opciones.reduce((suma, [, peso]) => suma + peso, 0);
    let punto = this.siguiente() * total;
    for (const [valor, peso] of opciones) {
      punto -= peso;
      if (punto < 0) return valor;
    }
    return opciones[opciones.length - 1][0];
  }

  /** Copia mezclada de la lista (Fisher-Yates). */
  mezclar<T>(lista: readonly T[]): T[] {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(this.siguiente() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  /** Toma n elementos distintos al azar (o todos si hay menos). */
  muestra<T>(lista: readonly T[], n: number): T[] {
    return this.mezclar(lista).slice(0, Math.max(0, n));
  }

  /** Identificador con formato uuid v4, también determinado por la semilla. */
  uuid(): string {
    const hex: string[] = [];
    for (let i = 0; i < 4; i++)
      hex.push(
        Math.floor(this.siguiente() * 4294967296)
          .toString(16)
          .padStart(8, '0'),
      );
    const s = hex.join('');
    const variante = ((parseInt(s[16], 16) & 0x3) | 0x8).toString(16);
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${variante}${s.slice(17, 20)}-${s.slice(20, 32)}`;
  }
}
