import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validarReapertura, validarReasignacion } from './continuidad-caso.js';

const id = '5c1c8adc-94d6-4df6-98c4-65a4644ee12a';
const version = 'a'.repeat(32);

describe('reapertura del caso', () => {
  it('conserva la referencia al cierre visto y normaliza el motivo', () => {
    expect(
      validarReapertura({
        motivo: '  Se requiere continuar el acompañamiento  ',
        movimiento_anterior_id: id.toUpperCase(),
      }),
    ).toEqual({
      motivo: 'Se requiere continuar el acompañamiento',
      movimiento_anterior_id: id,
    });
  });
  it.each([null, '', 'no-es-un-id', undefined])(
    'rechaza el motivo vacío o referencia inválida (%s)',
    (valor) => {
      expect(() =>
        validarReapertura({ motivo: '', movimiento_anterior_id: valor }),
      ).toThrow(BadRequestException);
    },
  );
  it('exige indicar qué movimiento se veía aunque no existiera uno', () => {
    expect(() => validarReapertura({ motivo: 'Continuar el apoyo' })).toThrow(
      BadRequestException,
    );
    expect(
      validarReapertura({
        motivo: 'Continuar el apoyo',
        movimiento_anterior_id: null,
      }).movimiento_anterior_id,
    ).toBeNull();
  });
  it('rechaza referencias mal formadas con un motivo válido', () => {
    expect(() =>
      validarReapertura({
        motivo: 'Continuar el apoyo',
        movimiento_anterior_id: 'otro',
      }),
    ).toThrow(BadRequestException);
  });
  it('acepta el límite y rechaza un motivo más largo', () => {
    expect(
      validarReapertura({ motivo: 'x'.repeat(500), movimiento_anterior_id: id })
        .motivo,
    ).toHaveLength(500);
    expect(() =>
      validarReapertura({
        motivo: 'x'.repeat(501),
        movimiento_anterior_id: id,
      }),
    ).toThrow(BadRequestException);
  });
});

describe('reasignación del caso', () => {
  const valido = {
    responsable_id: id,
    version_responsable: version,
    motivo: 'Cambio en el equipo de convivencia',
  };
  it('acepta la referencia al responsable y la versión vistos', () => {
    expect(validarReasignacion(valido)).toEqual(valido);
  });
  it.each([null, [], 3, 'otra-persona', ''])(
    'rechaza un responsable inválido (%s)',
    (responsable_id) => {
      expect(() => validarReasignacion({ ...valido, responsable_id })).toThrow(
        BadRequestException,
      );
    },
  );
  it.each(['', 'a'.repeat(31), 'g'.repeat(32), null, undefined])(
    'rechaza una versión inválida (%s)',
    (version_responsable) => {
      expect(() =>
        validarReasignacion({ ...valido, version_responsable }),
      ).toThrow(BadRequestException);
    },
  );
  it('no acepta un motivo vacío ni excesivo', () => {
    for (const motivo of ['', '  ', 'x'.repeat(501)])
      expect(() => validarReasignacion({ ...valido, motivo })).toThrow(
        BadRequestException,
      );
  });
  it('normaliza UUID sin aceptar escuela ni autor enviados por el cliente', () => {
    expect(
      validarReasignacion({
        ...valido,
        responsable_id: id.toUpperCase(),
        establecimiento_id: id,
        autor: id,
      }),
    ).toEqual(valido);
  });
});
