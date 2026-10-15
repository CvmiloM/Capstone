import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { type Formato, LIMITES } from './importacion.js';

// PB-019 (HU-015 CA2): lee la primera hoja de un CSV o XLSX. La primera fila
// con datos son los títulos de las columnas; cada fila siguiente se guarda con
// sus valores como texto, tal como venían, para que la vista previa (PB-020)
// los relacione con los campos de CONVI sin perder el original.

export type FilaLeida = {
  /** Número de la fila en el archivo, para ubicarla en Excel. */
  numero: number;
  datos: Record<string, string>;
};

export type HojaLeida = {
  columnas: string[];
  filas: FilaLeida[];
};

/** El archivo no se pudo leer o no cumple los límites; el mensaje es para la persona. */
export class ArchivoNoValido extends Error {}

export async function leerArchivo(
  contenido: Buffer,
  formato: Formato,
): Promise<HojaLeida> {
  const libro = new ExcelJS.Workbook();
  let hoja: ExcelJS.Worksheet | undefined;
  try {
    if (formato === 'xlsx') {
      // exceljs pide un ArrayBuffer; la copia también evita compartir memoria.
      await libro.xlsx.load(new Uint8Array(contenido).buffer);
      hoja = libro.worksheets[0];
    } else {
      const texto = decodificar(contenido);
      hoja = await libro.csv.read(Readable.from([texto]), {
        // Sin convertir números ni fechas: los datos quedan como venían.
        map: (valor: unknown) => valor,
        parserOptions: { delimiter: separador(texto) },
      });
    }
  } catch {
    throw new ArchivoNoValido(
      'No pudimos leer el archivo. Revisa que sea un CSV o un XLSX sin contraseña.',
    );
  }
  if (!hoja) throw new ArchivoNoValido('El archivo no tiene hojas.');
  if (hoja.columnCount > LIMITES.columnas)
    throw new ArchivoNoValido(
      `El archivo tiene más de ${LIMITES.columnas} columnas.`,
    );

  let columnas: string[] | null = null;
  const filas: FilaLeida[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    const valores: string[] = [];
    for (let c = 1; c <= hoja.columnCount; c++)
      valores.push(aTexto(fila.getCell(c).value));
    if (valores.every((v) => v === '')) return;
    if (!columnas) {
      columnas = titulos(valores);
      return;
    }
    const datos: Record<string, string> = {};
    columnas.forEach((columna, i) => (datos[columna] = valores[i] ?? ''));
    filas.push({ numero, datos });
  });

  if (!columnas || filas.length === 0)
    throw new ArchivoNoValido(
      'El archivo no tiene filas con datos debajo de los títulos.',
    );
  if (filas.length > LIMITES.filas)
    throw new ArchivoNoValido(
      `El archivo tiene ${filas.length.toLocaleString('es-CL')} filas; el máximo es ${LIMITES.filas.toLocaleString('es-CL')}.`,
    );
  return { columnas, filas };
}

// Excel en Windows guarda los CSV en windows-1252 si no se elige "CSV UTF-8":
// si el archivo no es UTF-8 válido, se lee así para no perder las tildes.
function decodificar(contenido: Buffer) {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(contenido);
  } catch {
    texto = new TextDecoder('windows-1252').decode(contenido);
  }
  return texto.replace(/^\uFEFF/, '');
}

// Excel en español separa con punto y coma; otros programas, con coma o
// tabulación. Se elige el que más aparece en la primera línea.
function separador(texto: string) {
  const primera = texto.split(/\r?\n/, 1)[0] ?? '';
  const candidatos = [';', ',', '\t'];
  const cuenta = (c: string) => primera.split(c).length - 1;
  return candidatos.reduce((mejor, c) =>
    cuenta(c) > cuenta(mejor) ? c : mejor,
  );
}

// Títulos sin repetir y sin vacíos, para usarlos como claves de cada fila.
function titulos(valores: string[]) {
  const usados = new Map<string, number>();
  return valores.map((valor, i) => {
    const base = valor.slice(0, 100) || `Columna ${i + 1}`;
    const veces = (usados.get(base) ?? 0) + 1;
    usados.set(base, veces);
    return veces === 1 ? base : `${base} (${veces})`;
  });
}

// Una celda de Excel puede ser texto, número, fecha, fórmula, enlace o texto
// con formato. Se guarda el texto que se ve; las fechas, como AAAA-MM-DD.
function aTexto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) {
    const iso = valor.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (typeof valor !== 'object') return String(valor).trim();
  if ('richText' in valor)
    return valor.richText
      .map((parte) => parte.text)
      .join('')
      .trim();
  if ('text' in valor && typeof valor.text === 'string')
    return valor.text.trim();
  if ('result' in valor) return aTexto(valor.result as ExcelJS.CellValue);
  if ('error' in valor) return String(valor.error);
  return '';
}