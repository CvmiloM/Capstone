import { UnauthorizedException } from '@nestjs/common';

// Renovar un token o verificar TOTP no equivale a volver a iniciar sesión.
const INGRESOS = new Set([
  'password',
  'otp',
  'recovery',
  'invite',
  'magiclink',
  'oauth',
  'sso/saml',
]);

export function comprobarIngresoPosterior(marca: unknown, amr: unknown) {
  if (marca === undefined) return;
  const desde = (marca as { desde?: unknown } | null)?.desde;
  if (
    typeof desde !== 'number' ||
    !Number.isSafeInteger(desde) ||
    desde <= 0 ||
    !Array.isArray(amr) ||
    !amr.some((entrada: unknown) => {
      const dato = entrada as { method?: unknown; timestamp?: unknown } | null;
      return (
        typeof dato?.method === 'string' &&
        INGRESOS.has(dato.method) &&
        typeof dato.timestamp === 'number' &&
        Number.isSafeInteger(dato.timestamp) &&
        dato.timestamp > desde
      );
    })
  )
    throw new UnauthorizedException(
      'El segundo factor se restableció, inicia sesión nuevamente',
    );
}
