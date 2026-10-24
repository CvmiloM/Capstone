import { BadRequestException } from '@nestjs/common';
import {
  comoPatron,
  normalizarCodigo,
  validarBusquedaExpedientes,
} from './busqueda-expedientes.js';

// PB-077 (HU-067 CA1 y CA3): filtros de la búsqueda de expedientes. Las
// consultas a la base y el aislamiento por escuela (CA2) se prueban contra la
// base local.

/** Campos con error del filtro, o null si lo acepta. */
function camposConError(consulta: Record<string, unknown>): string[] | null {
  try {
    validarBusquedaExpedientes(consulta);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const respuesta = (error as BadRequestException).getResponse() as {
      errores: Record<string, string>;
    };
    return Object.keys(respuesta.errores).sort();
  }
}

describe('validarBusquedaExpedientes', () => {
  it('sin filtros trae todo desde la primera página', () => {
    expect(validarBusquedaExpedientes({})).toEqual({
      codigo: null,
      estudiante: null,
      tipo: null,
      estado: null,
      desde: null,
      hasta: null,
      pagina: 1,
    });
  });

  it('limpia el código y el estudiante', () => {
    const filtro = validarBusquedaExpedientes({
      codigo: '  sit-2026 ',
      estudiante: '  Sofía   Pérez ',
    });
    expect(filtro.codigo).toBe('SIT-2026');
    expect(filtro.estudiante).toBe('Sofía Pérez');
  });

  it('acepta los estados de situaciones y de casos (CA3)', () => {
    expect(
      validarBusquedaExpedientes({ estado: 'SITUACION:EN_REVISION' }),
    ).toMatchObject({ tipo: 'SITUACION', estado: 'EN_REVISION' });
    expect(
      validarBusquedaExpedientes({ estado: 'CASO:REABIERTO' }),
    ).toMatchObject({ tipo: 'CASO', estado: 'REABIERTO' });
    expect(validarBusquedaExpedientes({ estado: 'CASO' })).toMatchObject({
      tipo: 'CASO',
      estado: null,
    });
  });

  it('acepta un período válido con los dos extremos', () => {
    expect(
      validarBusquedaExpedientes({ desde: '2026-03-01', hasta: '2026-03-01' }),
    ).toMatchObject({ desde: '2026-03-01', hasta: '2026-03-01' });
  });

  it('marca cada filtro mal escrito y los junta', () => {
    expect(camposConError({ codigo: 'SIT_2026' })).toEqual(['codigo']);
    expect(camposConError({ codigo: 'x'.repeat(41) })).toEqual(['codigo']);
    expect(camposConError({ estudiante: 'a'.repeat(101) })).toEqual([
      'estudiante',
    ]);
    expect(camposConError({ estado: 'CASO:NUEVA' })).toEqual(['estado']);
    expect(camposConError({ estado: 'NUEVA' })).toEqual(['estado']);
    expect(camposConError({ desde: '2026-02-30' })).toEqual(['desde']);
    expect(
      camposConError({ desde: '2026-05-01', hasta: '2026-04-30' }),
    ).toEqual(['hasta']);
    expect(
      camposConError({ codigo: 'a b%', estado: 'X', hasta: 'ayer' }),
    ).toEqual(['codigo', 'estado', 'hasta']);
  });

  it('una página que no es un número válido vuelve a la primera', () => {
    expect(validarBusquedaExpedientes({ pagina: '3' }).pagina).toBe(3);
    for (const pagina of ['0', '-2', '1.5', 'dos', '99999999', ['2']])
      expect(validarBusquedaExpedientes({ pagina }).pagina).toBe(1);
  });

  it('ignora valores que no son texto', () => {
    expect(
      validarBusquedaExpedientes({ codigo: ['SIT'], estudiante: 7 }),
    ).toMatchObject({ codigo: null, estudiante: null });
  });
});

describe('normalizarCodigo', () => {
  it('completa los ceros de un código escrito entero', () => {
    expect(normalizarCodigo('sit-2026-12')).toBe('SIT-2026-00012');
    expect(normalizarCodigo('CASO-2025-3')).toBe('CASO-2025-00003');
    expect(normalizarCodigo('SIT-2026-00012')).toBe('SIT-2026-00012');
  });

  it('deja igual una parte del código', () => {
    expect(normalizarCodigo('12')).toBe('12');
    expect(normalizarCodigo('caso-2026')).toBe('CASO-2026');
    expect(normalizarCodigo('sit 2026')).toBe('SIT2026');
  });
});

describe('comoPatron', () => {
  it('busca los comodines como texto', () => {
    expect(comoPatron('SIT')).toBe('%SIT%');
    expect(comoPatron('50%_x\\')).toBe('%50\\%\\_x\\\\%');
  });
});