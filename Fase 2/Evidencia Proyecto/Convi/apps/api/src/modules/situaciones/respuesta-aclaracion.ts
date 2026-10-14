import { BadRequestException } from '@nestjs/common';

// PB-049 (HU-042): respuesta del profesor a una aclaración. Se valida aquí
// aunque el formulario también lo haga: una petición directa no puede
// saltarse estas reglas (HU-119).
export const LARGO_MAXIMO_RESPUESTA = 4000;

/** CA1: la respuesta es obligatoria. Devuelve el texto sin espacios sobrantes. */
export function validarRespuesta(cuerpo: unknown): string {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const respuesta =
    typeof datos.respuesta === 'string' ? datos.respuesta.trim() : '';
  let error: string | undefined;
  if (!respuesta) error = 'Escribe tu respuesta.';
  else if (respuesta.length > LARGO_MAXIMO_RESPUESTA)
    error = `La respuesta admite hasta ${LARGO_MAXIMO_RESPUESTA} caracteres.`;
  if (error) {
    throw new BadRequestException({
      mensaje: 'Revisa tu respuesta. No se envió.',
      errores: { respuesta: error },
    });
  }
  return respuesta;
}