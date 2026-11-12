import { confirmarCorreoConConsentimiento } from '../../../../web/src/lib/supabase/confirmacion.js';
import type { SupabaseClient } from '@supabase/supabase-js';

function preparar(id: string | null) {
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: id ? { id } : null }, error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: 'cuenta-del-enlace' } }, error: null }),
  };
  return { auth, cliente: auth as unknown as SupabaseClient['auth'] };
}
it('no consume el enlace sin consentimiento', async () => {
  const { auth, cliente } = preparar('cuenta-actual');
  await expect(confirmarCorreoConConsentimiento(cliente, 'a'.repeat(64), false, 'cuenta-actual')).resolves.toMatchObject({ ok: false });
  expect(auth.verifyOtp).not.toHaveBeenCalled();
});
it('no cambia identidad si la sesión ya no es la mostrada', async () => {
  const { auth, cliente } = preparar('otra-cuenta');
  await expect(confirmarCorreoConConsentimiento(cliente, 'a'.repeat(64), true, 'cuenta-actual')).resolves.toEqual({ ok: false, motivo: 'sesion' });
  expect(auth.verifyOtp).not.toHaveBeenCalled();
});
it('verifica después de aceptar con la misma sesión y rechaza enlaces inválidos', async () => {
  const { auth, cliente } = preparar(null);
  await expect(confirmarCorreoConConsentimiento(cliente, 'a'.repeat(64), true, null)).resolves.toEqual({ ok: true });
  expect(auth.verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'a'.repeat(64) });
  auth.verifyOtp.mockClear();
  await expect(confirmarCorreoConConsentimiento(cliente, 'invalido', true, null)).resolves.toMatchObject({ ok: false });
  expect(auth.verifyOtp).not.toHaveBeenCalled();
});
it('conserva la sesión si no puede comprobarla y muestra enlace inválido si ya venció', async () => {
  const { auth, cliente } = preparar(null);
  auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthRetryableFetchError' } } as never);
  await expect(confirmarCorreoConConsentimiento(cliente, 'pkce_' + 'a'.repeat(64), true, null)).resolves.toEqual({ ok: false, motivo: 'conexion' });
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthSessionMissingError' } } as never);
  auth.verifyOtp.mockResolvedValueOnce({ data: { user: null }, error: { message: 'expired' } } as never);
  await expect(confirmarCorreoConConsentimiento(cliente, 'pkce_' + 'a'.repeat(64), true, null)).resolves.toEqual({ ok: false, motivo: 'enlace' });
});
