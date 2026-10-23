import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  disposicionDescarga,
  formatoReal,
  nombresEnZip,
  TAMANO_MAXIMO,
  validarArchivo,
  validarEvidencia,
} from './archivo-evidencia.js';

// PB-130 (HU-111) y PB-066 (HU-057): el servidor revisa el contenido real
// del archivo. Estas pruebas arman archivos mínimos de cada formato.

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);
const EML = Buffer.from(
  'From: apoderado@correo.test\r\nTo: convivencia@escuela.test\r\nSubject: Aviso\r\n\r\nHola.',
);

/** ZIP sin compresión con los archivos indicados, vacíos. */
function zip(nombres: string[]) {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const nombre of nombres) {
    const bytes = Buffer.from(nombre);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(bytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(bytes.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    locales.push(local, bytes);
    centrales.push(central, bytes);
    desplazamiento += 30 + bytes.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(nombres.length, 8);
  fin.writeUInt16LE(nombres.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

const DOCX = zip(['[Content_Types].xml', 'word/document.xml']);

function archivo(nombre: string, contenido: Buffer) {
  return { originalname: nombre, size: contenido.length, buffer: contenido };
}

/** El mensaje de error de validarArchivo, o null si acepta el archivo. */
function error(nombre: string, contenido: Buffer) {
  const resultado = validarArchivo(archivo(nombre, contenido));
  return 'error' in resultado ? resultado.error : null;
}

describe('Validación de archivos (PB-130, HU-111)', () => {
  it('reconoce el formato real de cada archivo admitido', () => {
    expect(formatoReal(PDF)).toBe('pdf');
    expect(formatoReal(PNG)).toBe('png');
    expect(formatoReal(JPG)).toBe('jpg');
    expect(formatoReal(WEBP)).toBe('webp');
    expect(formatoReal(DOCX)).toBe('docx');
    expect(formatoReal(EML)).toBe('eml');
    expect(formatoReal(Buffer.from('texto cualquiera'))).toBeNull();
    expect(formatoReal(zip(['hoja.csv']))).toBeNull();
  });

  it('lee los nombres internos de un ZIP y rechaza uno dañado', () => {
    expect(nombresEnZip(DOCX)).toEqual([
      '[Content_Types].xml',
      'word/document.xml',
    ]);
    expect(nombresEnZip(DOCX.subarray(0, DOCX.length - 30))).toBeNull();
  });

  it('acepta un archivo válido y calcula su huella en el servidor (CA2)', () => {
    expect(validarArchivo(archivo('acta firmada.pdf', PDF))).toEqual({
      nombre: 'acta firmada.pdf',
      formato: 'pdf',
      mime: 'application/pdf',
      tamano: PDF.length,
      sha256: createHash('sha256').update(PDF).digest('hex'),
    });
    expect(error('foto.JPEG', JPG)).toBeNull();
    expect(error('correo.eml', EML)).toBeNull();
  });

  it('quita las carpetas del nombre y corrige los acentos que entrega multer', () => {
    const resultado = validarArchivo(
      archivo('C:\\fotos\\patio\u00c3\u00b1o.png', PNG),
    );
    expect('nombre' in resultado && resultado.nombre).toBe('patioño.png');
  });

  it('rechaza programas aunque tengan nombre de documento (CA1)', () => {
    expect(error('informe.pdf', Buffer.from('MZ\x90\x00programa'))).toMatch(
      /programa/,
    );
    expect(error('script.eml', Buffer.from('#!/bin/sh\nrm -rf /'))).toMatch(
      /programa/,
    );
  });

  it('rechaza contenido que se ejecuta dentro de un formato admitido', () => {
    expect(
      error(
        'formulario.pdf',
        Buffer.from('%PDF-1.7\n<< /S /JavaScript /JS (app.alert(1)) >>'),
      ),
    ).toMatch(/programa/);
    expect(
      error('carta.docx', zip(['word/document.xml', 'word/vbaProject.bin'])),
    ).toMatch(/programa/);
    expect(
      error(
        'correo.eml',
        Buffer.concat([
          EML,
          Buffer.from(
            '\r\nContent-Disposition: attachment; filename="pago.exe"',
          ),
        ]),
      ),
    ).toMatch(/programa/);
  });

  it('exige que la extensión coincida con el contenido (CA1)', () => {
    expect(error('foto.png', PDF)).toMatch(/no corresponde/);
    expect(error('documento', PDF)).toMatch(/no corresponde/);
  });

  it('rechaza formatos no admitidos, archivos vacíos y de más de 25 MiB', () => {
    expect(error('planilla.csv', Buffer.from('a;b\n1;2'))).toMatch(
      /no se admite/,
    );
    expect(error('vacio.pdf', Buffer.alloc(0))).toMatch(/Elige/);
    expect(
      validarArchivo({
        originalname: 'grande.pdf',
        size: TAMANO_MAXIMO + 1,
        buffer: PDF,
      }),
    ).toEqual({ error: 'El archivo pesa más de 25 MB.' });
  });
});

describe('Datos de la evidencia (PB-066, HU-057)', () => {
  /** Campos con error de validarEvidencia, o null si acepta los datos. */
  function camposConError(validar: () => unknown) {
    try {
      validar();
      return null;
    } catch (excepcion) {
      expect(excepcion).toBeInstanceOf(BadRequestException);
      const respuesta = (excepcion as BadRequestException).getResponse() as {
        errores: Record<string, string>;
      };
      return Object.keys(respuesta.errores).sort();
    }
  }

  it('exige título, tipo y archivo (CA1)', () => {
    expect(camposConError(() => validarEvidencia({}, undefined))).toEqual([
      'archivo',
      'tipo',
      'titulo',
    ]);
  });

  it('acepta la evidencia y limpia los textos', () => {
    const evidencia = validarEvidencia(
      { titulo: ' Captura del chat ', tipo: 'IMAGEN', descripcion: '  ' },
      archivo('captura.png', PNG),
    );
    expect(evidencia).toMatchObject({
      titulo: 'Captura del chat',
      tipo: 'IMAGEN',
      descripcion: null,
      archivo: { formato: 'png' },
    });
  });

  it('no acepta el tipo Acta, que llega con PB-072', () => {
    expect(
      camposConError(() =>
        validarEvidencia(
          { titulo: 'Acta', tipo: 'ACTA' },
          archivo('acta.pdf', PDF),
        ),
      ),
    ).toEqual(['tipo']);
  });
});

describe('Descarga de evidencias (PB-066, HU-057 CA3)', () => {
  it('conserva el nombre original con acentos en la descarga', () => {
    expect(disposicionDescarga('Acta reunión "final".pdf')).toBe(
      `attachment; filename="Acta reuni_n _final_.pdf"; filename*=UTF-8''Acta%20reuni%C3%B3n%20%22final%22.pdf`,
    );
  });
});
