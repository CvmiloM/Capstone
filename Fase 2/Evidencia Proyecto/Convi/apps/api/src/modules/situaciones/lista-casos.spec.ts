import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { leerFiltrosCasos, valoresFiltrosCasos } from './lista-casos.js';

describe('filtros de casos', () => {
  it('normaliza el RUT, conserva la fecha de inicio y limita a diez filas', () => {
    const filtros = leerFiltrosCasos({
      nombre: ' Martina ',
      rut: '12.345.678-k',
      anio: '2025',
      fecha: '2025-11-10',
      pagina: '2',
    });
    expect(filtros).toMatchObject({
      nombre: 'Martina',
      rut: '12345678K',
      pagina: 2,
    });
    expect(valoresFiltrosCasos(filtros)).toEqual([
      '%Martina%',
      '12345678K',
      null,
      '',
      '2025-01-01',
      '2026-01-01',
      '2025-11-10',
      2,
      10,
    ]);
  });
  it('busca literalmente los comodines y mantiene el contenido fuera del SQL', () => {
    const valores = valoresFiltrosCasos(
      leerFiltrosCasos({ nombre: "O'Hara_100%\\" }),
    );
    expect(valores[0]).toBe("%O'Hara\\_100\\%\\\\%");
  });
  it.each([
    { pagina: '0' },
    { pagina: '-1' },
    { pagina: '1.5' },
    { pagina: '10000000' },
    { nombre: ['Martina'] },
    { nombre: 'x'.repeat(121) },
    { rut: '.' },
    { rut: '%12' },
    { responsable: 'otro' },
    { estado: 'DESCONOCIDO' },
    { anio: '202' },
    { fecha: '2025-02-29' },
    { fecha: '2026-13-01' },
    { fecha: '0000-01-01' },
  ])('rechaza filtros inválidos: %j', (consulta) => {
    expect(() => leerFiltrosCasos(consulta)).toThrow(BadRequestException);
  });
  it.each([
    'EN_ANALISIS',
    'EN_REVISION',
    'EN_INTERVENCION',
    'EN_SEGUIMIENTO',
    'CERRADO',
    'REABIERTO',
  ])('admite el estado %s', (estado) => {
    expect(leerFiltrosCasos({ estado }).estado).toBe(estado);
  });
});
