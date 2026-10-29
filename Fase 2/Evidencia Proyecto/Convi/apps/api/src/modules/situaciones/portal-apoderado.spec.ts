import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { CuentaService } from '../../database/cuenta.service.js';
import type { Sesion } from '../../common/sesion.js';
import { paginaPortal, comprobarCasoHijo } from './portal-apoderado.js';
import { ApoderadoService } from './apoderado.service.js';

const id = '11111111-1111-4111-8111-111111111111';
const caso = '22222222-2222-4222-8222-222222222222';
const sesion = { codigo_perfil: 'APODERADO' } as Sesion;

describe('PB-113: consulta paginada de apoderados', () => {
  it.each([
    [{}, 1],
    [{ pagina: '2' }, 2],
    [{ pagina: '10000' }, 10000],
  ])('valida la página %j', (entrada, salida) => {
    expect(paginaPortal(entrada as Record<string, unknown>)).toBe(salida);
  });
  it.each([
    { pagina: 2 },
    { pagina: [] },
    { pagina: '0' },
    { pagina: '-1' },
    { pagina: '1.2' },
    { pagina: '1e2' },
    { pagina: '10001' },
    { pagina: '' },
    { escuela: id },
    { perfil: 'ADMIN' },
  ])('rechaza filtros o páginas no válidos: %j', (entrada) => {
    expect(() => paginaPortal(entrada)).toThrow(BadRequestException);
  });
  it('no acepta un caso ajeno o una participación terminada', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(
      comprobarCasoHijo({ query } as unknown as PoolClient, id, caso),
    ).rejects.toThrow(NotFoundException);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('pa.activo_hasta IS NULL'),
      [id, caso],
    );
  });
  it.each(['listar', 'casos', 'detalle'] as const)(
    'no consulta datos si CuentaService rechaza %s',
    async (metodo) => {
      const operar = vi.fn().mockRejectedValue(new ForbiddenException());
      const servicio = new ApoderadoService({
        operar,
      } as unknown as CuentaService);
      const promesa =
        metodo === 'listar'
          ? servicio.listar(sesion, {})
          : metodo === 'casos'
            ? servicio.casos(sesion, id, {})
            : servicio.detalle(sesion, id, caso, {});
      await expect(promesa).rejects.toThrow(ForbiddenException);
      expect(operar).toHaveBeenCalledWith(
        sesion,
        expect.objectContaining({
          perfiles: ['APODERADO'],
          tipo:
            metodo === 'listar'
              ? 'establecimiento'
              : metodo === 'casos'
                ? 'estudiante'
                : 'caso',
        }),
        expect.any(Function),
      );
      if (metodo === 'detalle')
        expect(operar.mock.calls[0][1]).toEqual({
          tipo: 'caso',
          id: caso,
          estudianteId: id,
          perfiles: ['APODERADO'],
        });
    },
  );
});
