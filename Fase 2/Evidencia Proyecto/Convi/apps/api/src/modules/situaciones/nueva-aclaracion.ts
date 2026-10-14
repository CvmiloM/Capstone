import { BadRequestException } from '@nestjs/common';

// PB-045 (HU-038): pregunta que Convivencia le hace al profesor que registró
// la situación. Se valida aquí aunque el formulario también lo haga (HU-119).
export const LARGO_MAXIMO_PREGUNTA = 2000;

/** CA1: la pregunta es obligatoria. Devuelve el texto sin espacios sobrantes. */
export function validarPregunta(cuerpo: unknown): string {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const pregunta =
    typeof datos.pregunta === 'string' ? datos.pregunta.trim() : '';
  let error: string | undefined;
  if (!pregunta) error = 'Escribe la pregunta para el profesor.';
  else if (pregunta.length > LARGO_MAXIMO_PREGUNTA)
    error = `La pregunta admite hasta ${LARGO_MAXIMO_PREGUNTA} caracteres.`;
  if (error) {
    throw new BadRequestException({
      mensaje: 'Revisa la pregunta. No se envió la aclaración.',
      errores: { pregunta: error },
    });
  }
  return pregunta;
}
