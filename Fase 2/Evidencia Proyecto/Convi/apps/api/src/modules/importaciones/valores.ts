import { fechaValida, type Rol } from '../academico/curso.js';
import { claveDeTitulo } from './campos.js';

// PB-020 (HU-015 CA3): lectura de los valores de una fila según las opciones
// que eligió el administrador. Cada función devuelve null si no entiende el
// valor, para que la revisión lo marque con un mensaje.

/** Cómo vienen escritas las fechas que no son AAAA-MM-DD. */
export const FORMATOS_FECHA = ['DD-MM-AAAA', 'MM-DD-AAAA'] as const;
export type FormatoFecha = (typeof FORMATOS_FECHA)[number];

/** Qué hacer con un registro que ya existe en CONVI. */
export const TRATAMIENTOS_DUPLICADO = ['USAR_EXISTENTE', 'ERROR'] as const;
export type TratamientoDuplicado = (typeof TRATAMIENTOS_DUPLICADO)[number];

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+Z?)?$/;
const CON_SEPARADOR = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;

/**
 * Fecha como AAAA-MM-DD. Las celdas de fecha de Excel ya llegan así desde el
 * lector; el texto se lee con el formato elegido (15-04-2016, 15/4/2016 o
 * 15.04.2016 en DD-MM-AAAA). El año va siempre con 4 dígitos.
 */
export function leerFecha(valor: string, formato: FormatoFecha) {
  const iso = ISO.exec(valor);
  let fecha: string | null = null;
  if (iso) fecha = `${iso[1]}-${iso[2]}-${iso[3]}`;
  const partes = CON_SEPARADOR.exec(valor);
  if (partes) {
    const [primero, segundo, anio] = partes.slice(1);
    const [dia, mes] =
      formato === 'DD-MM-AAAA' ? [primero, segundo] : [segundo, primero];
    fecha = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  return fecha && fechaValida(fecha) ? fecha : null;
}

/** Sí o No; vacío devuelve el valor por omisión. */
export function leerSiNo(valor: string, porOmision: boolean) {
  const clave = claveDeTitulo(valor);
  if (!clave) return porOmision;
  if (['si', 's', 'x', '1', 'true', 'verdadero'].includes(clave)) return true;
  if (['no', 'n', '0', 'false', 'falso'].includes(clave)) return false;
  return null;
}

/** Profesor jefe o Profesor, escrito como se acostumbra en los colegios. */
export function leerRol(valor: string): Rol | null {
  const clave = claveDeTitulo(valor);
  if (['profesor jefe', 'profesora jefe', 'jefe', 'jefa', 'pj'].includes(clave))
    return 'PROFESOR_JEFE';
  if (
    [
      'profesor',
      'profesora',
      'docente',
      'profesor de asignatura',
      'profesora de asignatura',
      'asignatura',
    ].includes(clave)
  )
    return 'PROFESOR';
  return null;
}

/** Nombre para comparar personas sin importar tildes, mayúsculas ni espacios. */
export function claveDeNombre(nombres: string, apellidos: string) {
  return claveDeTitulo(`${nombres} ${apellidos}`);
}

/** Dos períodos AAAA-MM-DD que se cruzan; null es sin límite. */
export function seCruzan(
  desde1: string | null,
  hasta1: string | null,
  desde2: string | null,
  hasta2: string | null,
) {
  return (
    (desde1 === null || hasta2 === null || desde1 <= hasta2) &&
    (desde2 === null || hasta1 === null || desde2 <= hasta1)
  );
}