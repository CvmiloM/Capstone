import { BadRequestException } from '@nestjs/common';
import { validarFinVinculo, validarVinculo } from './apoderado.js';

const base = {
  persona_apoderado_id: '11111111-1111-4111-8111-111111111111',
  tipo_relacion: ' Madre ',
  es_principal: true,
  puede_ser_contactado: false,
};

describe('Vínculo apoderado-estudiante (HU-010)', () => {
  it('conserva la persona elegida, limpia la relación y permite fechas opcionales', () => {
    expect(validarVinculo(base)).toMatchObject({
      tipo_relacion: 'Madre',
      persona: null,
      activo_desde: null,
      activo_hasta: null,
      puede_ser_contactado: false,
    });
  });

  it.each([
    { tipo_relacion: '' },
    { tipo_relacion: 'x'.repeat(61) },
    { es_principal: 'false' },
    { puede_ser_contactado: null },
    { persona_apoderado_id: 'incorrecto' },
    { persona_apoderado_id: 123 },
    { activo_desde: '2026-02-30' },
    { activo_hasta: 2026 },
    { activo_desde: '2026-10-22', activo_hasta: '2026-10-21' },
  ])('rechaza datos inválidos enviados directamente a la API: %j', (cambio) => {
    expect(() => validarVinculo({ ...base, ...cambio })).toThrow(
      BadRequestException,
    );
  });

  it('valida una nueva persona sin exigir cuenta, correo ni RUT', () => {
    expect(
      validarVinculo({
        ...base,
        persona_apoderado_id: null,
        persona: { nombres: ' Ana ', apellidos: ' Prueba ' },
      }).persona,
    ).toMatchObject({
      nombres: 'Ana',
      apellidos: 'Prueba',
      correo: null,
      rut: null,
    });
  });

  it.each([
    { nombres: '', apellidos: 'Prueba' },
    { nombres: 'Ana', apellidos: '' },
    { nombres: 'Ana', apellidos: 'Prueba', rut: '12345678-9' },
    { nombres: 'Ana', apellidos: 'Prueba', correo: 'sin-arroba' },
    { nombres: 'Ana', apellidos: 'Prueba', telefono: 'abc' },
  ])('rechaza una ficha de contacto inválida: %j', (persona) => {
    expect(() =>
      validarVinculo({ ...base, persona_apoderado_id: null, persona }),
    ).toThrow(BadRequestException);
  });

  it('normaliza RUT y correo sin modificar la identidad de otra persona', () => {
    expect(
      validarVinculo({
        ...base,
        persona_apoderado_id: null,
        persona: {
          nombres: 'Ana',
          apellidos: 'Prueba',
          rut: '12.345.678-5',
          correo: ' ANA@EXAMPLE.TEST ',
        },
      }).persona,
    ).toMatchObject({ rut: '12345678-5', correo: 'ana@example.test' });
  });

  it('admite un período de un día y exige fecha real para terminar', () => {
    expect(
      validarVinculo({
        ...base,
        activo_desde: '2026-10-22',
        activo_hasta: '2026-10-22',
      }).activo_hasta,
    ).toBe('2026-10-22');
    expect(validarFinVinculo({ activo_hasta: '2026-10-22' })).toBe(
      '2026-10-22',
    );
    expect(() => validarFinVinculo({ activo_hasta: '2026-02-29' })).toThrow(
      BadRequestException,
    );
  });
});
