import { BadRequestException } from '@nestjs/common';
import { LARGO_MAXIMO_MOTIVO } from './cambio-urgencia.js';

// PB-046 (HU-039): responsable de revisar una situación. Se valida aquí
// aunque el formulario también lo haga (HU-119).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CambioResponsable = {
  /** Membresía de Convivencia que queda a cargo de la revisión. */
  responsable_id: string;
  /** El responsable que veía la persona al decidir, o null si no había (CA2). */
  responsable_anterior_id: string | null;
  /** Obligatorio al cambiar un responsable que ya estaba asignado (CA3). */
  motivo: string | null;
};

export function validarCambioResponsable(cuerpo: unknown): CambioResponsable {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  const responsable =
    typeof datos.responsable_id === 'string' && UUID.test(datos.responsable_id)
      ? datos.responsable_id.toLowerCase()
      : null;
  // CA2: hay que indicar a quién se veía, aunque fuera nadie (null o vacío).
  const anteriorValido =
    datos.responsable_anterior_id === null ||
    datos.responsable_anterior_id === '' ||
    (typeof datos.responsable_anterior_id === 'string' &&
      UUID.test(datos.responsable_anterior_id));
  const anterior =
    typeof datos.responsable_anterior_id === 'string' &&
    datos.responsable_anterior_id !== ''
      ? datos.responsable_anterior_id.toLowerCase()
      : null;

  if (!responsable)
    errores.responsable_id =
      'Elige a una persona del equipo de Convivencia de la lista.';
  else if (!anteriorValido)
    errores.responsable_id = 'Recarga la página e inténtalo nuevamente.';
  else if (responsable === anterior)
    errores.responsable_id = 'Esa persona ya es la responsable.';

  // CA3: la primera asignación no necesita motivo; cambiar a quien ya estaba sí.
  const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';
  if (anterior && !motivo)
    errores.motivo = 'Explica por qué cambias al responsable.';
  else if (motivo.length > LARGO_MAXIMO_MOTIVO)
    errores.motivo = `El motivo admite hasta ${LARGO_MAXIMO_MOTIVO} caracteres.`;

  if (!responsable || Object.keys(errores).length > 0) {
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. El responsable no cambió.',
      errores,
    });
  }
  return {
    responsable_id: responsable,
    responsable_anterior_id: anterior,
    motivo: motivo || null,
  };
}
