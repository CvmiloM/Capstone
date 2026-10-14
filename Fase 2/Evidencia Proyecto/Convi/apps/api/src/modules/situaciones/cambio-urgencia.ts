import { BadRequestException } from '@nestjs/common';
import { URGENCIAS } from './nueva-situacion.js';

// PB-044 (HU-037 CA3): cambio de urgencia de una situación por Convivencia.
// Se valida aquí aunque el formulario también lo haga (HU-119).
export const LARGO_MAXIMO_MOTIVO = 500;

export type CambioUrgencia = {
  urgencia: (typeof URGENCIAS)[number];
  /** La urgencia que veía la persona al decidir (PB-139). */
  urgencia_anterior: (typeof URGENCIAS)[number];
  motivo: string;
};

function esUrgencia(valor: unknown): valor is CambioUrgencia['urgencia'] {
  return (
    typeof valor === 'string' &&
    (URGENCIAS as readonly string[]).includes(valor)
  );
}

export function validarCambioUrgencia(cuerpo: unknown): CambioUrgencia {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  const urgencia = esUrgencia(datos.urgencia) ? datos.urgencia : null;
  const anterior = esUrgencia(datos.urgencia_anterior)
    ? datos.urgencia_anterior
    : null;
  if (!urgencia) errores.urgencia = 'Elige Normal, Urgente o Inmediata.';
  else if (!anterior)
    errores.urgencia = 'Recarga la página e inténtalo nuevamente.';
  else if (urgencia === anterior)
    errores.urgencia = 'Elige una urgencia distinta de la actual.';

  // CA3: cambiar la urgencia exige motivo; queda en la auditoría.
  const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';
  if (!motivo) errores.motivo = 'Explica por qué cambias la urgencia.';
  else if (motivo.length > LARGO_MAXIMO_MOTIVO)
    errores.motivo = `El motivo admite hasta ${LARGO_MAXIMO_MOTIVO} caracteres.`;

  if (!urgencia || !anterior || Object.keys(errores).length > 0) {
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. La urgencia no cambió.',
      errores,
    });
  }
  return { urgencia, urgencia_anterior: anterior, motivo };
}
