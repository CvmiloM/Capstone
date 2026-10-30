import { BadRequestException } from '@nestjs/common';
import { confirmacionRepetida } from '../importaciones/confirmacion-repetida.js';
import { validarReenvio } from './reenvio.js';

describe('PB-146 (HU-125): operaciones repetidas', () => {
  it('el reenvío acepta una clave de solicitud y la normaliza', () => {
    expect(
      validarReenvio({ solicitud_id: 'A1B2C3D4-0000-4000-8000-00000000000A' }),
    ).toEqual({ solicitud_id: 'a1b2c3d4-0000-4000-8000-00000000000a' });
  });

  it('sin clave se comporta como antes', () => {
    expect(validarReenvio(undefined)).toEqual({ solicitud_id: null });
    expect(validarReenvio({})).toEqual({ solicitud_id: null });
  });

  it.each(['no-es-uuid', 42, '', { otra: 1 }])(
    'rechaza una clave inválida (%o)',
    (solicitud_id) => {
      expect(() => validarReenvio({ solicitud_id })).toThrow(
        BadRequestException,
      );
    },
  );

  it.each([
    ['PROCESANDO', true],
    ['CONFIRMADO', true],
    ['REVISION', false],
    ['CARGADO', false],
    ['FALLIDO', false],
    ['CANCELADO', false],
  ])(
    'una importación %s cuenta como confirmación repetida: %s',
    (estado, repetida) => {
      expect(confirmacionRepetida(estado as string)).toBe(repetida);
    },
  );
});
