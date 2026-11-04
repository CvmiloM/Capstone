import { BadRequestException } from '@nestjs/common';
import { validarFiltrosIndicadores } from './indicadores.js';
import { OPCIONES_INDICADORES } from './indicadores.js';
import { IndicadoresService } from './indicadores.service.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import type { Sesion } from '../../common/sesion.js';

describe('Filtros de indicadores', () => {
  it('acepta un período y los identificadores válidos', () => {
    expect(validarFiltrosIndicadores({
      desde: '2026-01-01', hasta: '2026-12-31',
      curso: '8d7bcf7f-4258-4603-b309-3c8cef0ff48d',
    })).toMatchObject({ desde: '2026-01-01', hasta: '2026-12-31', categoria: null });
  });

  it.each([
    { desde: '2026-02-30', hasta: '2026-03-01' },
    { desde: '2026-12-31', hasta: '2026-01-01' },
    { desde: '2025-01-01', hasta: '2026-12-31' },
    { desde: '2026-01-01' },
    { categoria: 'otro' },
    { hasta: ['2026-01-01'] },
  ])('rechaza filtros inválidos o períodos excesivos', (filtros) => {
    expect(() => validarFiltrosIndicadores(filtros)).toThrow(BadRequestException);
  });
});

describe('Consulta inicial de indicadores', () => {
  it('sin fechas devuelve solo opciones y no calcula indicadores', async () => {
    const opciones = { cursos: [], categorias: [] };
    const query = vi.fn().mockResolvedValue({ rows: [{ opciones }] });
    const operar = vi.fn(async (_sesion, _acceso, trabajo) => trabajo({ query }));
    const servicio = new IndicadoresService({ operar } as unknown as CuentaService);

    expect(await servicio.consultar({} as Sesion, {})).toEqual({ opciones });
    expect(query).toHaveBeenCalledExactlyOnceWith(OPCIONES_INDICADORES);
    expect(operar).toHaveBeenCalledWith({}, { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] }, expect.any(Function));
  });

  it.each([
    { desde: '2026-01-01' },
    { desde: '2026-02-01', hasta: '2026-01-31' },
  ])('no consulta la base con fechas incompletas o invertidas', (filtros) => {
    const operar = vi.fn();
    const servicio = new IndicadoresService({ operar } as unknown as CuentaService);
    expect(() => servicio.consultar({} as Sesion, filtros)).toThrow(BadRequestException);
    expect(operar).not.toHaveBeenCalled();
  });
});
