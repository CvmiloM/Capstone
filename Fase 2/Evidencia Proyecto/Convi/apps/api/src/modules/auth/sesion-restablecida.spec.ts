import { describe, it, expect } from 'vitest';
import { comprobarIngresoPosterior } from './sesion-restablecida.js';

describe('PB-154, sesiones anteriores al restablecimiento', () => {
  it('no altera cuentas sin restablecimientos', () => {
    expect(() => comprobarIngresoPosterior(undefined, undefined)).not.toThrow();
  });
  it.each(['password', 'otp', 'recovery', 'oauth', 'sso/saml'])(
    'acepta un nuevo ingreso %s',
    (method) => {
      expect(() =>
        comprobarIngresoPosterior({ desde: 100 }, [{ method, timestamp: 101 }]),
      ).not.toThrow();
    },
  );
  it.each([
    undefined,
    [],
    [{ method: 'password', timestamp: 100 }],
    [{ method: 'password', timestamp: 99 }],
    [{ method: 'token_refresh', timestamp: 101 }],
    [{ method: 'totp', timestamp: 101 }],
    [{ method: 'password', timestamp: '101' }],
    [
      { method: 'password', timestamp: 99 },
      { method: 'totp', timestamp: 101 },
    ],
    [null],
  ])('rechaza una sesión antigua, renovación o AMR inválido %j', (amr) => {
    expect(() => comprobarIngresoPosterior({ desde: 100 }, amr)).toThrow();
  });
  it.each([null, {}, { desde: '100' }, { desde: -1 }, { desde: NaN }])(
    'una marca dañada no abre el acceso %j',
    (marca) => {
      expect(() =>
        comprobarIngresoPosterior(marca, [
          { method: 'password', timestamp: 101 },
        ]),
      ).toThrow();
    },
  );
});
