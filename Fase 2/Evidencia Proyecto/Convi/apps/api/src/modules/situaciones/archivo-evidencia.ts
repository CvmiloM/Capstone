import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { esDia } from './plan-intervencion.js';

// PB-130 (HU-111) y PB-066 (HU-057): archivo y datos de una evidencia. El
// servidor revisa el contenido real del archivo, no solo su nombre ni el tipo
// que informa el navegador, y calcula la huella SHA-256 (CA2). El espacio
// privado de Storage vuelve a limitar el tamaño a 25 MiB.

/** CA1: base propuesta para el piloto, la misma de convi.archivos. */
export const TAMANO_MAXIMO = 25 * 1024 * 1024;
export const LARGO_MAXIMO_TITULO_EVIDENCIA = 220;
export const LARGO_MAXIMO_DESCRIPCION_EVIDENCIA = 2000;

// HU-057 CA1. El acta (ACTA) se adjunta aparte, con su fecha del documento
// (PB-072, validarActa).
export const TIPOS_EVIDENCIA = [
  'DOCUMENTO',
  'IMAGEN',
  'CORREO',
  'OTRO',
] as const;

// Decisión del PO (por defecto): documentos PDF y Word, imágenes JPG, PNG y
// WEBP, y correos exportados como EML. Cada formato admite sus extensiones.
export const FORMATOS_ARCHIVO = {
  pdf: { mime: 'application/pdf', extensiones: ['pdf'] },
  jpg: { mime: 'image/jpeg', extensiones: ['jpg', 'jpeg'] },
  png: { mime: 'image/png', extensiones: ['png'] },
  webp: { mime: 'image/webp', extensiones: ['webp'] },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensiones: ['docx'],
  },
  eml: { mime: 'message/rfc822', extensiones: ['eml'] },
} as const;
export type FormatoArchivo = keyof typeof FORMATOS_ARCHIVO;

/** Lo que entrega el interceptor de archivos de NestJS (multer). */
export type ArchivoSubido = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

export type ArchivoValido = {
  /** Nombre del archivo sin carpetas, como lo eligió la persona. */
  nombre: string;
  formato: FormatoArchivo;
  mime: string;
  tamano: number;
  sha256: string;
};

export type NuevaEvidencia = {
  titulo: string;
  tipo: (typeof TIPOS_EVIDENCIA)[number];
  descripcion: string | null;
  archivo: ArchivoValido;
};

/** PB-072 (HU-062 CA1): el acta firmada, siempre de tipo Acta y con la fecha del documento. */
export type NuevaActa = Omit<NuevaEvidencia, 'tipo'> & {
  tipo: 'ACTA';
  /** AAAA-MM-DD. */
  fecha_documento: string;
};

const MENSAJE = 'Revisa los datos marcados. No se adjuntó la evidencia.';
const PROGRAMA =
  'El archivo contiene un programa o código que se ejecuta. Adjunta un PDF, una imagen o un correo exportado.';

// Igual que en las importaciones (PB-019): multer entrega el nombre leído
// como latin1; si no trae caracteres fuera de latin1 se vuelve a leer como
// UTF-8. También se quitan las carpetas que algunos navegadores incluyen.
function nombreDelArchivo(original: string) {
  const enLatin1 =
    Buffer.from(original, 'latin1').toString('latin1') === original;
  const texto = enLatin1
    ? Buffer.from(original, 'latin1').toString('utf8')
    : original;
  return (texto.split(/[\\/]/).pop() ?? '').trim().slice(0, 255);
}

function empiezaCon(contenido: Buffer, firma: number[], desde = 0) {
  return firma.every((byte, i) => contenido[desde + i] === byte);
}

/** Programas que nunca se aceptan, aunque cambien de nombre (CA1). */
function esPrograma(contenido: Buffer) {
  return (
    empiezaCon(contenido, [0x4d, 0x5a]) || // MZ: programas de Windows
    empiezaCon(contenido, [0x7f, 0x45, 0x4c, 0x46]) || // ELF: Linux
    empiezaCon(contenido, [0xcf, 0xfa, 0xed, 0xfe]) || // Mach-O: macOS
    empiezaCon(contenido, [0xca, 0xfe, 0xba, 0xbe]) ||
    empiezaCon(contenido, [0x23, 0x21]) // #!: scripts
  );
}

// Adjuntos o archivos internos que se ejecutan al abrirlos.
const EXTENSIONES_PELIGROSAS =
  'exe|com|bat|cmd|scr|msi|dll|js|jse|vbs|vbe|wsf|ps1|jar|hta|lnk|sh';
const NOMBRE_PELIGROSO = new RegExp(`\\.(${EXTENSIONES_PELIGROSAS})$`, 'i');

/**
 * Nombres de los archivos dentro de un ZIP, leídos del directorio central
 * (al final del archivo). Si el ZIP está dañado devuelve null.
 */
export function nombresEnZip(contenido: Buffer): string[] | null {
  // Fin del directorio central: firma PK\x05\x06 en los últimos 64 KiB.
  const desde = Math.max(0, contenido.length - 65557);
  const fin = contenido.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < desde || fin + 22 > contenido.length) return null;
  const cantidad = contenido.readUInt16LE(fin + 10);
  let posicion = contenido.readUInt32LE(fin + 16);
  const nombres: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    if (
      posicion + 46 > contenido.length ||
      !empiezaCon(contenido, [0x50, 0x4b, 0x01, 0x02], posicion)
    )
      return null;
    const largoNombre = contenido.readUInt16LE(posicion + 28);
    const largoExtra = contenido.readUInt16LE(posicion + 30);
    const largoComentario = contenido.readUInt16LE(posicion + 32);
    if (posicion + 46 + largoNombre > contenido.length) return null;
    nombres.push(
      contenido.toString('utf8', posicion + 46, posicion + 46 + largoNombre),
    );
    posicion += 46 + largoNombre + largoExtra + largoComentario;
  }
  return nombres;
}

/** Formato real según el contenido, o null si no es uno de los admitidos. */
export function formatoReal(contenido: Buffer): FormatoArchivo | null {
  if (empiezaCon(contenido, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (empiezaCon(contenido, [0xff, 0xd8, 0xff])) return 'jpg';
  if (empiezaCon(contenido, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'png';
  if (
    empiezaCon(contenido, [0x52, 0x49, 0x46, 0x46]) &&
    empiezaCon(contenido, [0x57, 0x45, 0x42, 0x50], 8)
  )
    return 'webp';
  // Un DOCX es un ZIP con word/document.xml adentro.
  if (
    empiezaCon(contenido, [0x50, 0x4b, 0x03, 0x04]) &&
    nombresEnZip(contenido)?.includes('word/document.xml')
  )
    return 'docx';
  // Un correo exportado es texto con encabezados como From: o Subject:.
  const inicio = contenido.subarray(0, 8192);
  if (
    !inicio.includes(0) &&
    /^(from|to|subject|date|received|mime-version|message-id|return-path):/im.test(
      inicio.toString('latin1'),
    )
  )
    return 'eml';
  return null;
}

/** Contenido activo dentro de un formato admitido: macros, scripts o adjuntos ejecutables. */
function contenidoEjecutable(formato: FormatoArchivo, contenido: Buffer) {
  // Acciones de JavaScript, programas que se abren o archivos incrustados.
  if (formato === 'pdf')
    return /\/(JavaScript|Launch|EmbeddedFile)\b/.test(
      contenido.toString('latin1'),
    );
  // Macros (vbaProject.bin) o programas guardados dentro del documento.
  if (formato === 'docx')
    return (nombresEnZip(contenido) ?? []).some(
      (nombre) =>
        nombre.toLowerCase().endsWith('vbaproject.bin') ||
        NOMBRE_PELIGROSO.test(nombre),
    );
  // Adjuntos del correo con nombre de programa.
  if (formato === 'eml')
    return new RegExp(
      `name\\*?=\\s*"?[^"\\r\\n;]*\\.(${EXTENSIONES_PELIGROSAS})\\b`,
      'i',
    ).test(contenido.toString('latin1'));
  return false;
}

/** PB-130: formato real, extensión, tamaño y huella del archivo. */
export function validarArchivo(
  archivo: ArchivoSubido | undefined,
): ArchivoValido | { error: string } {
  if (!archivo || archivo.size === 0)
    return { error: 'Elige el archivo de la evidencia.' };
  if (archivo.size > TAMANO_MAXIMO)
    return { error: 'El archivo pesa más de 25 MB.' };
  const nombre = nombreDelArchivo(archivo.originalname);
  const extension = nombre.includes('.')
    ? (nombre.split('.').pop() ?? '').toLowerCase()
    : '';
  if (esPrograma(archivo.buffer)) return { error: PROGRAMA };
  const formato = formatoReal(archivo.buffer);
  if (!formato)
    return {
      error:
        'Ese tipo de archivo no se admite. Adjunta un PDF, un Word (DOCX), una imagen JPG, PNG o WEBP, o un correo exportado (EML).',
    };
  // CA1: la extensión debe coincidir con el contenido real.
  if (
    !(FORMATOS_ARCHIVO[formato].extensiones as readonly string[]).includes(
      extension,
    )
  )
    return {
      error: `El nombre del archivo no corresponde a su contenido, que es ${formato.toUpperCase()}. Revisa la extensión.`,
    };
  if (contenidoEjecutable(formato, archivo.buffer)) return { error: PROGRAMA };
  return {
    nombre,
    formato,
    mime: FORMATOS_ARCHIVO[formato].mime,
    tamano: archivo.size,
    // CA2: la huella la calcula el servidor.
    sha256: createHash('sha256').update(archivo.buffer).digest('hex'),
  };
}

/** HU-057 CA1: título, tipo y archivo obligatorios; descripción opcional. */
export function validarEvidencia(
  cuerpo: unknown,
  archivo: ArchivoSubido | undefined,
): NuevaEvidencia {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  const titulo = typeof datos.titulo === 'string' ? datos.titulo.trim() : '';
  if (!titulo) errores.titulo = 'Escribe un título para la evidencia.';
  else if (titulo.length > LARGO_MAXIMO_TITULO_EVIDENCIA)
    errores.titulo = `El título admite hasta ${LARGO_MAXIMO_TITULO_EVIDENCIA} caracteres.`;

  const tipo = TIPOS_EVIDENCIA.find((t) => t === datos.tipo);
  if (!tipo)
    errores.tipo = 'Elige si es un documento, una imagen, un correo u otro.';

  const descripcion =
    typeof datos.descripcion === 'string' ? datos.descripcion.trim() : '';
  if (descripcion.length > LARGO_MAXIMO_DESCRIPCION_EVIDENCIA)
    errores.descripcion = `La descripción admite hasta ${LARGO_MAXIMO_DESCRIPCION_EVIDENCIA} caracteres.`;

  const revisado = validarArchivo(archivo);
  if ('error' in revisado) errores.archivo = revisado.error;

  if (!tipo || 'error' in revisado || Object.keys(errores).length > 0)
    throw new BadRequestException({ mensaje: MENSAJE, errores });
  return {
    titulo,
    tipo,
    descripcion: descripcion || null,
    archivo: revisado,
  };
}

/**
 * PB-072 (HU-062 CA1): título, fecha del documento y archivo obligatorios;
 * descripción opcional. El servicio revisa que la fecha no sea futura ni
 * anterior al día del encuentro.
 */
export function validarActa(
  cuerpo: unknown,
  archivo: ArchivoSubido | undefined,
): NuevaActa {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  const titulo = typeof datos.titulo === 'string' ? datos.titulo.trim() : '';
  if (!titulo) errores.titulo = 'Escribe un título para el acta.';
  else if (titulo.length > LARGO_MAXIMO_TITULO_EVIDENCIA)
    errores.titulo = `El título admite hasta ${LARGO_MAXIMO_TITULO_EVIDENCIA} caracteres.`;

  const fecha = datos.fecha_documento;
  if (!esDia(fecha))
    errores.fecha_documento = 'Indica la fecha que lleva el acta.';

  const descripcion =
    typeof datos.descripcion === 'string' ? datos.descripcion.trim() : '';
  if (descripcion.length > LARGO_MAXIMO_DESCRIPCION_EVIDENCIA)
    errores.descripcion = `La descripción admite hasta ${LARGO_MAXIMO_DESCRIPCION_EVIDENCIA} caracteres.`;

  const revisado = validarArchivo(archivo);
  if ('error' in revisado)
    errores.archivo =
      !archivo || archivo.size === 0
        ? 'Elige el archivo escaneado del acta.'
        : revisado.error;

  if (!esDia(fecha) || 'error' in revisado || Object.keys(errores).length > 0)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se adjuntó el acta.',
      errores,
    });
  return {
    titulo,
    tipo: 'ACTA',
    descripcion: descripcion || null,
    archivo: revisado,
    fecha_documento: fecha,
  };
}

/** Content-Disposition de la descarga, con el nombre original en UTF-8. */
export function disposicionDescarga(nombre: string) {
  const simple = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${simple}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}
