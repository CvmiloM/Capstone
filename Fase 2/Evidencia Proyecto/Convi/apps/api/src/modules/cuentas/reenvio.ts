import { BadRequestException } from '@nestjs/common';

// PB-146 (HU-125): el reenvío de una invitación lleva una clave de solicitud que
// arma la página. Si la misma solicitud llega dos veces (doble clic o la red la
// reintenta) se envía un solo correo y las dos reciben la misma respuesta.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarReenvio(cuerpo: unknown): {
  solicitud_id: string | null;
} {
  const valor =
    typeof cuerpo === 'object' && cuerpo !== null
      ? (cuerpo as Record<string, unknown>).solicitud_id
      : undefined;
  // Sin clave se comporta como antes, para no romper llamadas que todavía no la mandan.
  if (valor === undefined || valor === null) return { solicitud_id: null };
  if (typeof valor !== 'string' || !UUID.test(valor))
    throw new BadRequestException(
      'La solicitud de reenvío no es válida, actualiza la página e inténtalo nuevamente.',
    );
  return { solicitud_id: valor.toLowerCase() };
}
