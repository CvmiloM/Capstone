import { LARGO_MOTIVO, objeto, texto } from '../academico/curso.js';
import { errorDeCampos } from './importacion.js';

// PB-024 y PB-025 (HU-019): corregir una fila, y cancelar o restaurar una
// importación. Se valida aquí aunque el formulario también lo haga: una
// petición directa no puede saltarse estas reglas.

/** Dónde queda la corrección dentro de datos_normalizados de la fila. */
export const CLAVE_CORRECCION = '_correccion';

/** Largo máximo de un valor corregido; la revisión aplica después el de cada campo. */
export const LARGO_MAXIMO_VALOR = 1000;

/** CA2: lo que escribió el administrador, por campo, y quién y cuándo. */
export type Correccion = {
  /** Campo → valor como vendría en el archivo; "" deja el campo vacío. */
  valores: Record<string, string>;
  /** Membresía de quien corrigió. */
  por: string;
  /** Fecha y hora ISO. */
  en: string;
};

/** La corrección guardada en datos_normalizados->'_correccion', o null. */
export function leerCorreccion(guardada: unknown): Correccion | null {
  const datos = objeto(guardada);
  if (typeof datos.por !== 'string' || typeof datos.en !== 'string')
    return null;
  const valores = Object.fromEntries(
    Object.entries(objeto(datos.valores)).filter(
      ([, valor]) => typeof valor === 'string',
    ),
  ) as Record<string, string>;
  if (Object.keys(valores).length === 0) return null;
  return { valores, por: datos.por, en: datos.en };
}

/**
 * CA2: { valores: { campo: valor } } con los campos relacionados de la fila.
 * Devuelve solo lo que cambia respecto del archivo; si no cambia nada, la
 * fila vuelve a los valores del archivo.
 */
export function validarCorreccion(
  cuerpo: unknown,
  relacionados: string[],
  delArchivo: Record<string, string>,
): Record<string, string> {
  const enviados = objeto(objeto(cuerpo).valores);
  const errores: Record<string, string> = {};
  const valores: Record<string, string> = {};
  for (const [campo, valor] of Object.entries(enviados)) {
    if (!relacionados.includes(campo)) {
      errores[campo] =
        'Este campo no se relaciona con ninguna columna. Recarga la página.';
      continue;
    }
    if (typeof valor !== 'string') {
      errores[campo] = 'Escribe el valor como texto.';
      continue;
    }
    const limpio = valor.trim();
    if (limpio.length > LARGO_MAXIMO_VALOR)
      errores[campo] = `Usa como máximo ${LARGO_MAXIMO_VALOR} caracteres.`;
    else if (limpio !== (delArchivo[campo] ?? '')) valores[campo] = limpio;
  }
  if (Object.keys(errores).length > 0)
    throw errorDeCampos(
      errores,
      'Revisa los datos marcados. No se guardó la corrección.',
    );
  return valores;
}

/** CA4 y CA5: el motivo de cancelar o restaurar, que queda en la auditoría. */
export function validarMotivo(
  cuerpo: unknown,
  accion: 'cancelar' | 'restaurar',
): string {
  const motivo = texto(objeto(cuerpo).motivo);
  if (
    motivo.length < LARGO_MOTIVO.minimo ||
    motivo.length > LARGO_MOTIVO.maximo
  )
    throw errorDeCampos(
      {
        motivo: `Explica en ${LARGO_MOTIVO.minimo} a ${LARGO_MOTIVO.maximo} caracteres por qué la ${accion === 'cancelar' ? 'cancelas' : 'restauras'}: quedará en la auditoría.`,
      },
      accion === 'cancelar'
        ? 'Revisa los datos marcados. No se canceló la importación.'
        : 'Revisa los datos marcados. No se restauró la importación.',
    );
  return motivo;
}
