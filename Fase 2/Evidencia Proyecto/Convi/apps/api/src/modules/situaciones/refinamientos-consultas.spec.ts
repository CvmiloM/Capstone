import type { Sesion } from '../../common/sesion.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import { HistorialService } from './historial.service.js';
import { resumenAlerta } from '../alertas/resumen-alerta.js';

describe('AD-003: búsqueda explícita y lectura de alertas', () => {
  const sesion = {} as Sesion;
  function historial() {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: 12 }] })
      .mockResolvedValueOnce({ rows: [] });
    const operar = vi.fn(
      async (
        _s: unknown,
        _p: unknown,
        trabajo: (db: unknown) => Promise<unknown>,
      ) => trabajo({ query }),
    );
    return {
      query,
      operar,
      servicio: new HistorialService({ operar } as unknown as CuentaService),
    };
  }
  it.each(['', ' ', 'A', undefined])(
    'no consulta estudiantes para una búsqueda insuficiente: %s',
    async (buscar) => {
      const t = historial();
      expect(await t.servicio.buscar(sesion, buscar, '1')).toEqual({
        estudiantes: [],
        total: 0,
        pagina: 1,
        por_pagina: 10,
      });
      expect(t.query).not.toHaveBeenCalled();
      expect(t.operar).toHaveBeenCalledWith(
        sesion,
        { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
        expect.any(Function),
      );
    },
  );
  it('pagina en servidor y trata comodines como texto', async () => {
    const t = historial();
    const r = await t.servicio.buscar(sesion, 'Ana%_', '2');
    expect(r.por_pagina).toBe(10);
    expect(t.query.mock.calls[1][0]).toContain('LIMIT 10 OFFSET $3');
    expect(t.query.mock.calls[1][1][0]).toBe('%Ana\\%\\_%');
    expect(t.query.mock.calls[1][1][2]).toBe(10);
  });
  it.each([
    ['GT', 'más de'],
    ['GE', 'al menos'],
    ['LT', 'menos de'],
    ['LE', 'como máximo'],
    ['EQ', 'exactamente'],
  ])('explica el operador %s sin símbolos', (operador, texto) => {
    const r = resumenAlerta({
      metrica: 'CONTEO_SITUACIONES',
      conteo: 3,
      operador,
      umbral: 2,
      formula: 'NO SE DEBE INTERPRETAR > 999',
    });
    expect(r).toContain('3 situaciones');
    expect(r).toContain(`${texto} 2 situaciones`);
    expect(r).not.toMatch(/[<>=]/);
    expect(r).not.toContain('999');
  });
  it('distingue vencimientos y variaciones, incluidos umbrales cero y negativos', () => {
    expect(
      resumenAlerta({
        metrica: 'CONTEO_VENCIDOS',
        conteo: 1,
        operador: 'GT',
        umbral: 0,
      }),
    ).toContain('1 registro vencido');
    expect(
      resumenAlerta({
        metrica: 'VARIACION_PORCENTUAL',
        variacion: -25,
        operador: 'LE',
        umbral: -20,
      }),
    ).toContain('como máximo -20 %');
    expect(
      resumenAlerta({ metrica: 'VARIACION_PORCENTUAL', variacion: null }),
    ).toContain('no es calculable');
  });
  it('no inventa cifras ni traduce una fórmula desconocida', () => {
    expect(resumenAlerta(null)).toContain('revisar sus antecedentes');
    expect(resumenAlerta({ metrica: 'OTRA', conteo: 8 })).not.toContain('8');
    expect(
      resumenAlerta({ metrica: 'CONTEO_SITUACIONES', conteo: Number.NaN }),
    ).not.toContain('NaN');
  });
});
