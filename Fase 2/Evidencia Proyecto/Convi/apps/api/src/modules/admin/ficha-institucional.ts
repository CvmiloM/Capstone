import { BadRequestException } from '@nestjs/common';
import { LARGO_MAXIMO } from '../registro/nueva-escuela.js';

export const CAMPOS_FICHA = [
  'codigo',
  'direccion',
  'telefono',
  'correo_contacto',
  'region',
  'comuna',
] as const;

export type CambioFicha = Record<
  (typeof CAMPOS_FICHA)[number],
  string | null
> & {
  actualizado_en: string;
};

// Los códigos de prueba anteriores pueden conservarse, al corregirlos se exige RBD.
export function validarCambioRbd(
  codigo: string | null,
  anterior: string | null,
) {
  if (codigo !== anterior && codigo !== null && !/^[1-9]\d*$/.test(codigo))
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados',
      errores: {
        codigo:
          'Ingresa el RBD solo con números, sin puntos, guion ni dígito verificador',
      },
    });
}

// Solo estos seis datos se editan, la escuela siempre sale de la sesión.
export function validarFichaInstitucional(cuerpo: unknown): CambioFicha {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo))
    throw new BadRequestException('Los datos de la ficha no son válidos');
  const entrada = cuerpo as Record<string, unknown>;
  const errores: Record<string, string> = {};
  const datos = {} as CambioFicha;
  for (const clave of Object.keys(entrada)) {
    if (
      clave !== 'actualizado_en' &&
      !CAMPOS_FICHA.some((campo) => campo === clave)
    )
      throw new BadRequestException(
        'Solo puedes editar los datos de contacto de tu escuela',
      );
  }
  for (const campo of CAMPOS_FICHA) {
    const valor = entrada[campo];
    if (valor !== null && typeof valor !== 'string') {
      errores[campo] = 'Envía un texto válido para este campo';
      continue;
    }
    const texto = valor?.trim() || null;
    const maximo =
      campo === 'telefono'
        ? LARGO_MAXIMO.telefono_escuela
        : LARGO_MAXIMO[campo];
    if (texto && texto.length > maximo)
      errores[campo] = `Usa como máximo ${maximo} caracteres`;
    if (texto && /\p{Cc}/u.test(texto))
      errores[campo] =
        'Escribe el dato en una sola línea, sin caracteres de control';
    datos[campo] = texto;
  }
  if (
    datos.correo_contacto &&
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.correo_contacto)
  )
    errores.correo_contacto = 'Ingresa un correo válido';
  const version = entrada.actualizado_en;
  if (
    typeof version !== 'string' ||
    version.length > 80 ||
    !/^\d{4}-\d{2}-\d{2}[T ]/.test(version) ||
    !Number.isFinite(Date.parse(version))
  )
    throw new BadRequestException(
      'Recarga la ficha antes de guardar los cambios',
    );
  datos.actualizado_en = version;
  if (Object.keys(errores).length)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados',
      errores,
    });
  return datos;
}
