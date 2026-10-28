import { BadRequestException } from '@nestjs/common';
import { validarEstadoNomina } from './estudiante.js';
import {
  diaAnterior,
  ESTADO_ESTUDIANTE,
  ESTADO_TERMINO,
  terminoMatricula,
  validarMovimiento,
} from './movimiento-matricula.js';

const MATRICULA = '11111111-1111-4111-8111-111111111111';
const CURSO = '22222222-2222-4222-8222-222222222222';

function camposConError(cuerpo: unknown) {
  try {
    validarMovimiento(cuerpo);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const respuesta = (error as BadRequestException).getResponse() as {
      errores: Record<string, string>;
    };
    return Object.keys(respuesta.errores).sort();
  }
}

describe('Movimientos de matrícula (HU-017 y HU-024)', () => {
  it('CA1: el cambio de curso y el paso de año exigen el curso de destino', () => {
    expect(
      validarMovimiento({
        tipo: 'traslado',
        matricula_id: MATRICULA.toUpperCase(),
        curso_id: CURSO,
        fecha: '2026-08-03',
        motivo: '  Cambio de jornada ',
      }),
    ).toEqual({
      tipo: 'TRASLADO',
      matricula_id: MATRICULA,
      curso_id: CURSO,
      fecha: '2026-08-03',
      motivo: 'Cambio de jornada',
    });
    expect(
      camposConError({
        tipo: 'PROMOCION',
        matricula_id: MATRICULA,
        fecha: '2027-03-01',
      }),
    ).toEqual(['curso_id']);
  });

  it('el egreso y el retiro no abren matrícula: ignoran el curso', () => {
    expect(
      validarMovimiento({
        tipo: 'RETIRO',
        matricula_id: MATRICULA,
        curso_id: CURSO,
        fecha: '2026-10-27',
      }),
    ).toMatchObject({ tipo: 'RETIRO', curso_id: null, motivo: null });
  });

  it.each([
    [{ tipo: 'BORRAR' }, ['tipo']],
    [{ fecha: '2026-02-30' }, ['fecha']],
    [{ fecha: '' }, ['fecha']],
    [{ motivo: 123 }, ['motivo']],
    [{ motivo: 'x'.repeat(501) }, ['motivo']],
  ])('rechaza datos inválidos enviados directamente: %j', (cambio, campos) => {
    expect(
      camposConError({
        tipo: 'EGRESO',
        matricula_id: MATRICULA,
        fecha: '2026-12-18',
        ...cambio,
      }),
    ).toEqual(campos);
  });

  it('sin la matrícula vigente que vio el administrador pide recargar', () => {
    expect(() =>
      validarMovimiento({ tipo: 'RETIRO', fecha: '2026-10-27' }),
    ).toThrow(BadRequestException);
  });

  it('CA1 y CA4 de HU-017, CA1 de HU-024: estado final de la matrícula y del estudiante', () => {
    expect(ESTADO_TERMINO).toEqual({
      TRASLADO: 'TRASLADADO',
      PROMOCION: 'COMPLETADO',
      EGRESO: 'COMPLETADO',
      RETIRO: 'RETIRADO',
    });
    expect(ESTADO_ESTUDIANTE).toEqual({
      EGRESO: 'EGRESADO',
      RETIRO: 'INACTIVO',
    });
  });

  it('calcula el día anterior sin que la zona horaria cambie la fecha', () => {
    expect(diaAnterior('2027-03-01')).toBe('2027-02-28');
    expect(diaAnterior('2028-03-01')).toBe('2028-02-29');
    expect(diaAnterior('2027-01-01')).toBe('2026-12-31');
  });

  it('CA3: la matrícula anterior termina sin compartir días con la nueva', () => {
    // Cambio de curso: el día antes del primero en el curso nuevo.
    expect(terminoMatricula('TRASLADO', '2026-08-03', '2026-12-18')).toBe(
      '2026-08-02',
    );
    // Paso de año: el último día de su año, o el día antes si es antes.
    expect(terminoMatricula('PROMOCION', '2027-03-01', '2026-12-18')).toBe(
      '2026-12-18',
    );
    expect(terminoMatricula('PROMOCION', '2026-12-10', '2026-12-18')).toBe(
      '2026-12-09',
    );
    expect(terminoMatricula('PROMOCION', '2027-03-01', null)).toBe(
      '2027-02-28',
    );
    // Egreso y retiro: la fecha indicada.
    expect(terminoMatricula('EGRESO', '2026-12-18', '2026-12-18')).toBe(
      '2026-12-18',
    );
    expect(terminoMatricula('RETIRO', '2026-10-27', null)).toBe('2026-10-27');
  });

  it('CA2 de HU-024: la nómina muestra por defecto solo a los Activos', () => {
    expect(validarEstadoNomina(undefined)).toBe('ACTIVO');
    expect(validarEstadoNomina('otro')).toBe('ACTIVO');
    expect(validarEstadoNomina(['INACTIVO'])).toBe('ACTIVO');
    expect(validarEstadoNomina('inactivo')).toBe('INACTIVO');
    expect(validarEstadoNomina('EGRESADO')).toBe('EGRESADO');
    expect(validarEstadoNomina('TODOS')).toBe('TODOS');
  });
});
