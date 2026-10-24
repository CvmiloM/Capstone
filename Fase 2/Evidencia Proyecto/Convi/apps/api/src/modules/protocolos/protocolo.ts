import { BadRequestException } from '@nestjs/common';

// PB-081 (HU-070) y PB-083 (HU-072): protocolos de la escuela. Una versión se
// prepara en Borrador con sus pasos ordenados y se publica después de
// revisarla; publicada, ni ella ni sus pasos cambian (la base lo impide). Se
// valida aquí aunque el formulario también lo haga (HU-119).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CODIGO = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const LARGO_MAXIMO_CODIGO = 50;
export const LARGO_MAXIMO_NOMBRE = 220;
export const LARGO_MAXIMO_NOTAS = 4000;
export const LARGO_MAXIMO_NOMBRE_PASO = 180;
export const LARGO_MAXIMO_DESCRIPCION_PASO = 4000;
export const MAXIMO_ORDEN_PASO = 999;
export const MAXIMO_PLAZO = 100000;

/** HU-070 CA2: unidades del plazo de cada paso. */
export const UNIDADES_PLAZO = [
  'MINUTOS',
  'HORAS',
  'DIAS_HABILES',
  'DIAS',
] as const;

export type NuevoProtocolo = { codigo: string; nombre: string };
export type DatosVersion = {
  version_documento_origen_id: string | null;
  notas: string | null;
};
export type DatosPaso = {
  orden_paso: number;
  nombre: string;
  descripcion: string | null;
  valor_plazo: number | null;
  unidad_plazo: (typeof UNIDADES_PLAZO)[number] | null;
  requiere_evidencia: boolean;
  es_obligatorio: boolean;
};
export type Publicacion = { vigente_desde: string };

function datosDe(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** Un número entero desde un formulario: null si viene vacío, NaN si no es válido. */
function entero(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = typeof valor === 'string' ? Number(valor.trim()) : valor;
  return typeof numero === 'number' && Number.isInteger(numero) ? numero : NaN;
}

/** Casillas de formulario y JSON: true, "true", "on" o "1" cuentan como marcadas. */
function marcado(valor: unknown) {
  return valor === true || valor === 'true' || valor === 'on' || valor === '1';
}

function rechazar(errores: Record<string, string>, mensaje: string) {
  if (Object.keys(errores).length > 0)
    throw new BadRequestException({ mensaje, errores });
}

export function validarProtocolo(cuerpo: unknown): NuevoProtocolo {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const codigo = texto(datos.codigo).toUpperCase();
  if (!codigo) errores.codigo = 'Escribe un código corto, por ejemplo P-ACOSO.';
  else if (codigo.length > LARGO_MAXIMO_CODIGO || !CODIGO.test(codigo))
    errores.codigo = `Usa letras, números, guiones o guion bajo, hasta ${LARGO_MAXIMO_CODIGO} caracteres.`;
  const nombre = texto(datos.nombre);
  if (!nombre) errores.nombre = 'Escribe el nombre del protocolo.';
  else if (nombre.length > LARGO_MAXIMO_NOMBRE)
    errores.nombre = `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE} caracteres.`;
  rechazar(errores, 'Revisa los datos marcados. No se creó el protocolo.');
  return { codigo, nombre };
}

/** HU-070 CA1: documento de origen y notas de una versión en Borrador. */
export function validarVersion(cuerpo: unknown): DatosVersion {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const documento = texto(datos.version_documento_origen_id);
  if (documento && !UUID.test(documento))
    errores.version_documento_origen_id = 'Elige un documento de la lista.';
  const notas = texto(datos.notas);
  if (notas.length > LARGO_MAXIMO_NOTAS)
    errores.notas = `Las notas admiten hasta ${LARGO_MAXIMO_NOTAS} caracteres.`;
  rechazar(errores, 'Revisa los datos marcados. No se guardó la versión.');
  return {
    version_documento_origen_id: documento ? documento.toLowerCase() : null,
    notas: notas || null,
  };
}

/** HU-070 CA2: orden, nombre, plazo con su unidad, evidencia y obligatoriedad. */
export function validarPaso(cuerpo: unknown): DatosPaso {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};

  const orden = entero(datos.orden_paso);
  if (
    orden === null ||
    Number.isNaN(orden) ||
    orden < 1 ||
    orden > MAXIMO_ORDEN_PASO
  )
    errores.orden_paso = `Indica el orden del paso, un número entre 1 y ${MAXIMO_ORDEN_PASO}.`;

  const nombre = texto(datos.nombre);
  if (!nombre) errores.nombre = 'Escribe el nombre del paso.';
  else if (nombre.length > LARGO_MAXIMO_NOMBRE_PASO)
    errores.nombre = `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE_PASO} caracteres.`;

  const descripcion = texto(datos.descripcion);
  if (descripcion.length > LARGO_MAXIMO_DESCRIPCION_PASO)
    errores.descripcion = `La descripción admite hasta ${LARGO_MAXIMO_DESCRIPCION_PASO} caracteres.`;

  // El plazo es opcional, pero si se indica va con su unidad.
  const plazo = entero(datos.valor_plazo);
  const unidad = UNIDADES_PLAZO.find((u) => u === datos.unidad_plazo) ?? null;
  if (
    plazo !== null &&
    (Number.isNaN(plazo) || plazo < 0 || plazo > MAXIMO_PLAZO)
  )
    errores.valor_plazo = 'El plazo debe ser un número entero de 0 o más.';
  else if (plazo !== null && !unidad)
    errores.unidad_plazo = 'Elige la unidad del plazo.';
  else if (plazo === null && texto(datos.unidad_plazo))
    errores.valor_plazo = 'Indica cuánto es el plazo o deja la unidad vacía.';

  rechazar(errores, 'Revisa los datos marcados. No se guardó el paso.');
  return {
    orden_paso: orden!,
    nombre,
    descripcion: descripcion || null,
    valor_plazo: plazo,
    unidad_plazo: plazo === null ? null : unidad,
    requiere_evidencia: marcado(datos.requiere_evidencia),
    es_obligatorio: marcado(datos.es_obligatorio),
  };
}

function esFechaReal(valor: string) {
  if (!FECHA.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return (
    !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
  );
}

/** HU-072 CA1: la fecha desde la que rige la versión publicada. */
export function validarPublicacion(cuerpo: unknown): Publicacion {
  const datos = datosDe(cuerpo);
  const fecha = texto(datos.vigente_desde);
  if (!esFechaReal(fecha))
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se publicó la versión.',
      errores: { vigente_desde: 'Indica desde qué día rige esta versión.' },
    });
  return { vigente_desde: fecha };
}
