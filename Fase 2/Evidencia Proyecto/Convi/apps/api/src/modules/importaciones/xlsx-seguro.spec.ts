import ExcelJS from 'exceljs';
import { deflateRawSync } from 'node:zlib';
import { comprobarXlsx, MAXIMO_XLSX_EXPANDIDO } from './xlsx-seguro.js';
import { leerArchivoDirecto } from './lector.js';

// Archivo mínimo sintético: no se abre con ExcelJS, solo comprueba el presupuesto ZIP.
function entradaZip(datos: Buffer, declarado = datos.length) {
  const comprimido = deflateRawSync(datos);
  const nombre = Buffer.from('xl/hoja.xml');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8); local.writeUInt16LE(nombre.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(comprimido.length, 20); central.writeUInt32LE(declarado, 24); central.writeUInt16LE(nombre.length, 28);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(46 + nombre.length, 12); fin.writeUInt32LE(30 + nombre.length + comprimido.length, 16);
  return Buffer.concat([local, nombre, comprimido, central, nombre, fin]);
}

describe('presupuesto de lectura XLSX', () => {
  it('conserva primera hoja, tildes y valores de un libro normal', async () => {
    const libro = new ExcelJS.Workbook();
    libro.addWorksheet('Estudiantes').addRows([['Nombre', 'Curso'], ['Sofía Muñoz', 'I medio A']]);
    const archivo = Buffer.from(await libro.xlsx.writeBuffer());
    await expect(comprobarXlsx(archivo)).resolves.toBeUndefined();
    await expect(leerArchivoDirecto(archivo, 'xlsx')).resolves.toMatchObject({ filas: [{ datos: { Nombre: 'Sofía Muñoz', Curso: 'I medio A' } }] });
  });
  it('rechaza expansión declarada excesiva antes de descomprimir', async () => {
    await expect(comprobarXlsx(entradaZip(Buffer.from('dato'), MAXIMO_XLSX_EXPANDIDO + 1))).rejects.toThrow('descomprimirlo');
  });
  it('mide bytes reales y no confía en el tamaño declarado', async () => {
    await expect(comprobarXlsx(entradaZip(Buffer.alloc(65536, 65), 16))).rejects.toThrow('descomprimirlo');
  });
  it('rechaza archivos truncados sin cargar el libro', async () => {
    await expect(comprobarXlsx(Buffer.from('PK'))).rejects.toThrow('estructura');
  });
});
