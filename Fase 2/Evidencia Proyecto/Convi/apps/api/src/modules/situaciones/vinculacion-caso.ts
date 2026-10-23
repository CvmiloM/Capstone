import { BadRequestException } from '@nestjs/common';

// PB-052 (HU-045): Convivencia vincula una situación En revisión a un caso
// existente que elige y confirma. Se valida aquí aunque el formulario también
// lo haga (HU-119); la base vuelve a exigir que el caso comparta un estudiante
// con la situación y no deja trasladarla ni desvincularla después (CA4).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LARGO_MAXIMO_FUNDAMENTO_VINCULACION = 2000;

export type NuevaVinculacion = {
  caso_id: string;
  /** Por qué la situación se sigue en ese caso (CA2). */
  fundamento: string;
  /** La última revisión que veía la persona al decidir, o null (PB-139). */
  revision_anterior_id: string | null;
};

export function validarVinculacion(cuerpo: unknown): NuevaVinculacion {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  // CA1: el caso se elige de la lista; la API comprueba que esté permitido.
  const caso = typeof datos.caso_id === 'string' ? datos.caso_id : '';
  if (!UUID.test(caso)) errores.caso_id = 'Elige el caso al que la vinculas.';

  // CA2: la decisión se registra con su fundamento.
  const fundamento =
    typeof datos.fundamento === 'string' ? datos.fundamento.trim() : '';
  if (!fundamento)
    errores.fundamento = 'Explica por qué esta situación se sigue en ese caso.';
  else if (fundamento.length > LARGO_MAXIMO_FUNDAMENTO_VINCULACION)
    errores.fundamento = `El fundamento admite hasta ${LARGO_MAXIMO_FUNDAMENTO_VINCULACION} caracteres.`;

  // PB-139: hay que indicar la última revisión que se veía, aunque no hubiera.
  const anterior = datos.revision_anterior_id;
  const anteriorValido =
    anterior === null ||
    anterior === '' ||
    (typeof anterior === 'string' && UUID.test(anterior));
  if (!anteriorValido)
    errores.caso_id = 'Recarga la página e inténtalo nuevamente.';

  if (Object.keys(errores).length > 0) {
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se vinculó la situación.',
      errores,
    });
  }
  return {
    caso_id: caso.toLowerCase(),
    fundamento,
    revision_anterior_id:
      typeof anterior === 'string' && anterior !== ''
        ? anterior.toLowerCase()
        : null,
  };
}
