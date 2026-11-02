import { BadRequestException } from '@nestjs/common';
import { validarFiltrosIndicadores } from './indicadores.js';

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
