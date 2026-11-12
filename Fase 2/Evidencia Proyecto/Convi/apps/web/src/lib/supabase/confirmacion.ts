import type { SupabaseClient } from '@supabase/supabase-js';

export const hashConfirmacionValido = (valor: unknown): valor is string =>
  typeof valor === 'string' && /^[a-z0-9_-]{20,512}$/i.test(valor);

/** No consume el enlace ni cambia cookies hasta recibir consentimiento explícito. */
export async function confirmarCorreoConConsentimiento(
  auth: Pick<SupabaseClient['auth'], 'getUser' | 'verifyOtp'>,
  token: string,
  aceptado: boolean,
  identidadMostrada: string | null,
) {
  if (!hashConfirmacionValido(token) || !aceptado) return { ok: false, motivo: 'aceptar' } as const;
  const actual = await auth.getUser();
  if (actual.error && actual.error.name !== 'AuthSessionMissingError')
    return { ok: false, motivo: 'conexion' } as const;
  if ((actual.data.user?.id ?? null) !== identidadMostrada)
    return { ok: false, motivo: 'sesion' } as const;
  const resultado = await auth.verifyOtp({ type: 'email', token_hash: token });
  return resultado.error || !resultado.data.user
    ? { ok: false, motivo: 'enlace' } as const
    : { ok: true } as const;
}
