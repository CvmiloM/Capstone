import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { Sesion } from '../../common/sesion.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import { EstudiantesService } from './estudiantes.service.js';

const base = {
  confirmado: true,
  total_esperado: 2,
  motivo: 'Corrección de una importación equivocada',
  fecha: '2026-11-01',
};
describe('confirmación de desactivación masiva', () => {
  it.each([
    { confirmado: false },
    { total_esperado: 0 },
    { total_esperado: 10001 },
    { total_esperado: '2' },
    { motivo: '' },
    { motivo: 'a'.repeat(501) },
    { fecha: '2026-02-30' },
  ])('rechaza entradas inseguras %j', (cambio) => {
    const operar = vi.fn();
    const servicio = new EstudiantesService({
      operar,
    } as unknown as CuentaService);
    expect(() =>
      servicio.desactivar({} as Sesion, { ...base, ...cambio }),
    ).toThrow(BadRequestException);
    expect(operar).not.toHaveBeenCalled();
  });
});
