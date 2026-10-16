import { BadRequestException } from '@nestjs/common';

// PB-019 (HU-015): carga del archivo de una importación administrativa. Se
// valida aquí aunque el formulario también lo haga: una petición directa no
// puede saltarse estas reglas.

// CA1: solo datos administrativos. La base rechaza cualquier otro tipo
// (convi.validar_integracion).
export const TIPOS = [
  'ESTUDIANTES',
  'CURSOS',
  'PROFESORES',
  'APODERADOS',
  'MATRICULAS',
  'ASIGNACIONES',
] as const;
export type TipoImportacion = (typeof TIPOS)[number];

// Decisión del PO: hasta 5 MB y 5.000 filas por archivo.
export const LIMITES = { bytes: 5 * 1024 * 1024, filas: 5000, columnas: 100 };

export const FORMATOS = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;
export type Formato = keyof typeof FORMATOS;

/** Lo que entrega el interceptor de archivos de NestJS (multer). */
export type ArchivoSubido = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

export type CargaValida = {
  tipo: TipoImportacion;
  formato: Formato;
  /** Nombre del archivo sin carpetas, como lo eligió la persona. */
  nombre: string;
};

const MENSAJE = 'Revisa los datos marcados. No se cargó el archivo.';

/** La respuesta indica cada campo con problema, con la clave igual al campo enviado. */
export function errorDeCampos(
  errores: Record<string, string>,
  mensaje = MENSAJE,
) {
  return new BadRequestException({ mensaje, errores });
}

// multer entrega el nombre leído como latin1: "Nómina.xlsx" llega como
// "NÃ³mina.xlsx". Si no trae caracteres fuera de latin1, se vuelve a leer como
// UTF-8. También se quitan las carpetas que algunos navegadores incluyen.
function nombreDelArchivo(original: string) {
  const enLatin1 =
    Buffer.from(original, 'latin1').toString('latin1') === original;
  const texto = enLatin1
    ? Buffer.from(original, 'latin1').toString('utf8')
    : original;
  return (texto.split(/[\\/]/).pop() ?? '').trim().slice(0, 255);
}

/** CA1: el tipo de datos y un archivo CSV o XLSX de hasta 5 MB. */
export function validarCarga(
  tipo: unknown,
  archivo: ArchivoSubido | undefined,
): CargaValida {
  const errores: Record<string, string> = {};

  const valor = typeof tipo === 'string' ? tipo.trim().toUpperCase() : '';
  if (!(TIPOS as readonly string[]).includes(valor))
    errores.tipo = 'Elige qué datos trae el archivo.';

  let formato: Formato | null = null;
  let nombre = '';
  if (!archivo || archivo.size === 0) {
    errores.archivo = 'Elige un archivo CSV o XLSX.';
  } else {
    nombre = nombreDelArchivo(archivo.originalname);
    const extension = nombre.toLowerCase().split('.').pop();
    if (extension !== 'csv' && extension !== 'xlsx')
      errores.archivo = 'El archivo debe ser CSV o XLSX.';
    else if (archivo.size > LIMITES.bytes)
      errores.archivo = 'El archivo pesa más de 5 MB.';
    else formato = extension;
  }

  if (Object.keys(errores).length > 0 || !formato) throw errorDeCampos(errores);
  return { tipo: valor as TipoImportacion, formato, nombre };
}