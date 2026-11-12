import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';

// El límite de subida comprimida no limita el trabajo de descompresión.
export const MAXIMO_XLSX_EXPANDIDO = 32 * 1024 * 1024;
const MAXIMO_ENTRADAS = 512;
export class XlsxNoValido extends Error {}

/** Comprueba TODAS las entradas, incluso hojas que ExcelJS no vaya a mostrar. */
export async function comprobarXlsx(contenido: Buffer) {
  const invalido = () => new XlsxNoValido('El Excel tiene una estructura no admitida. Guarda una copia como XLSX o utiliza CSV.');
  const excedido = () => new XlsxNoValido('El Excel es demasiado grande al descomprimirlo. Reduce su contenido o utiliza CSV.');
  let fin = -1;
  for (let i = contenido.length - 22; i >= Math.max(0, contenido.length - 65557); i--) {
    if (contenido.readUInt32LE(i) === 0x06054b50 && i + 22 + contenido.readUInt16LE(i + 20) === contenido.length) { fin = i; break; }
  }
  if (fin < 0 || contenido.readUInt16LE(fin + 4) || contenido.readUInt16LE(fin + 6)) throw invalido();
  const cantidad = contenido.readUInt16LE(fin + 10);
  const largo = contenido.readUInt32LE(fin + 12);
  const comienzo = contenido.readUInt32LE(fin + 16);
  if (!cantidad || cantidad > MAXIMO_ENTRADAS || cantidad !== contenido.readUInt16LE(fin + 8)
    || comienzo + largo !== fin) throw invalido();
  let cursor = comienzo;
  let total = 0;
  let declarado = 0;
  const nombres = new Set<string>();
  for (let n = 0; n < cantidad; n++) {
    if (cursor + 46 > fin || contenido.readUInt32LE(cursor) !== 0x02014b50) throw invalido();
    const flags = contenido.readUInt16LE(cursor + 8);
    const metodo = contenido.readUInt16LE(cursor + 10);
    const comprimido = contenido.readUInt32LE(cursor + 20);
    const expandido = contenido.readUInt32LE(cursor + 24);
    const nombreBytes = contenido.readUInt16LE(cursor + 28);
    const siguiente = cursor + 46 + nombreBytes + contenido.readUInt16LE(cursor + 30) + contenido.readUInt16LE(cursor + 32);
    const local = contenido.readUInt32LE(cursor + 42);
    if (siguiente > fin || flags & 1 || ![0, 8].includes(metodo)
      || contenido.readUInt16LE(cursor + 34) || local + 30 > comienzo) throw invalido();
    const nombre = contenido.subarray(cursor + 46, cursor + 46 + nombreBytes);
    const clave = nombre.toString('utf8');
    if (nombres.has(clave)) throw invalido();
    nombres.add(clave);
    declarado += expandido;
    if (declarado > MAXIMO_XLSX_EXPANDIDO) throw excedido();
    if (contenido.readUInt32LE(local) !== 0x04034b50 || contenido.readUInt16LE(local + 8) !== metodo
      || contenido.readUInt16LE(local + 6) & 1) throw invalido();
    const inicioNombre = local + 30;
    const finNombre = inicioNombre + contenido.readUInt16LE(local + 26);
    const inicio = finNombre + contenido.readUInt16LE(local + 28);
    if (inicio + comprimido > comienzo || !nombre.equals(contenido.subarray(inicioNombre, finNombre))) throw invalido();
    const datos = contenido.subarray(inicio, inicio + comprimido);
    let leidos = 0;
    if (metodo === 0) { leidos = datos.length; total += leidos; }
    else {
      const entrada = Readable.from([datos]);
      const salida = entrada.pipe(createInflateRaw());
      try {
        for await (const trozo of salida) {
          leidos += (trozo as Buffer).length;
          total += (trozo as Buffer).length;
          if (total > MAXIMO_XLSX_EXPANDIDO || leidos > expandido) throw excedido();
        }
      } catch (error) {
        if (error instanceof XlsxNoValido) throw error;
        throw invalido();
      } finally { salida.destroy(); entrada.destroy(); }
    }
    if (total > MAXIMO_XLSX_EXPANDIDO) throw excedido();
    if (leidos !== expandido) throw invalido();
    cursor = siguiente;
  }
  if (cursor !== fin) throw invalido();
}
