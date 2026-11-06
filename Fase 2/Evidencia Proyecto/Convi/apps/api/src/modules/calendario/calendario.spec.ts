import { BadRequestException } from '@nestjs/common';
import { leerFiltrosCalendario, TIPOS_EVENTO } from './calendario.js';

// PB-085 (HU-074): las reglas del calendario viven en el servidor (HU-119).

describe('Filtros del calendario (PB-085)', () => {
  it('sin filtros pide el mes actual con todos los tipos', () => {
    expect(leerFiltrosCalendario()).toEqual({ mes: null, tipos: null });
    expect(leerFiltrosCalendario({ mes: '', tipos: '' })).toEqual({
      mes: null,
      tipos: null,
    });
  });

  it('acepta un mes y tipos conocidos, sin repetir', () => {
    expect(
      leerFiltrosCalendario({
        mes: '2026-11',
        tipos: 'COMPROMISO,ACTUACION,COMPROMISO',
      }),
    ).toEqual({ mes: '2026-11', tipos: ['COMPROMISO', 'ACTUACION'] });
    expect(leerFiltrosCalendario({ tipos: TIPOS_EVENTO.join(',') }).tipos).toEqual([
      ...TIPOS_EVENTO,
    ]);
  });

  it.each(['2026-13', '2026-1', '26-11', '1999-12', '2026-11-01', 5])(
    'rechaza el mes %s',
    (mes) => {
      expect(() => leerFiltrosCalendario({ mes })).toThrow(BadRequestException);
    },
  );

  it.each(['VISITA', 'ACTUACION,VISITA', ',', 'actuacion'])(
    'rechaza los tipos %s',
    (tipos) => {
      expect(() => leerFiltrosCalendario({ tipos })).toThrow(BadRequestException);
    },
  );
});
