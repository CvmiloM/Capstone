import { BadRequestException } from '@nestjs/common';
import {
  validarCambioRbd,
  validarFichaInstitucional,
} from './ficha-institucional.js';

const base = {
  codigo: ' PRUEBA-029 ',
  direccion: ' Calle de prueba 123 ',
  telefono: '+56 9 1234 5678',
  correo_contacto: ' contacto@example.test ',
  region: ' Biobío ',
  comuna: ' Concepción ',
  actualizado_en: '2026-10-23 10:00:00.123456+00',
};

describe('Ficha institucional HU-022', () => {
  it.each(['8485', '12345', null])(
    'permite corregir el RBD o dejarlo vacío: %s',
    (codigo) => {
      expect(() => validarCambioRbd(codigo, 'CODIGO-ANTERIOR')).not.toThrow();
    },
  );
  it.each(['RBD-8485', '8.485', '8485-1', '0', '08485'])(
    'rechaza un RBD modificado con formato inválido: %s',
    (codigo) => {
      expect(() => validarCambioRbd(codigo, null)).toThrow(BadRequestException);
    },
  );
  it('permite guardar otros datos conservando un código de pruebas anterior', () => {
    expect(() => validarCambioRbd('PRUEBA', 'PRUEBA')).not.toThrow();
  });
  it('normaliza espacios y conserva la versión con microsegundos', () => {
    expect(validarFichaInstitucional(base)).toEqual({
      ...base,
      codigo: 'PRUEBA-029',
      direccion: 'Calle de prueba 123',
      correo_contacto: 'contacto@example.test',
      region: 'Biobío',
      comuna: 'Concepción',
    });
  });
  it('permite retirar datos opcionales sin inventar un código', () => {
    expect(
      validarFichaInstitucional({ ...base, codigo: '  ', comuna: null }),
    ).toMatchObject({ codigo: null, comuna: null });
  });
  it.each([
    null,
    [],
    'texto',
    { ...base, codigo: 123 },
    { ...base, telefono: {} },
    { ...base, codigo: 'x'.repeat(41) },
    { ...base, region: 'x'.repeat(101) },
    { ...base, comuna: 'x'.repeat(101) },
    { ...base, telefono: 'x'.repeat(41) },
    { ...base, direccion: 'x'.repeat(201) },
    { ...base, correo_contacto: 'x'.repeat(181) },
    { ...base, correo_contacto: 'sin-arroba' },
    { ...base, direccion: 'dato\u0000' },
    { ...base, actualizado_en: undefined },
    { ...base, actualizado_en: 'ayer' },
    { ...base, id: 'otra-escuela' },
    { ...base, establecimiento_id: 'otra-escuela' },
    { ...base, nombre: 'Otro nombre' },
    { ...base, creado_en: '2020-01-01' },
    { ...base, estado: 'INACTIVO' },
    { ...base, zona_horaria: 'UTC' },
  ])('rechaza valores inválidos o campos fuera del alcance: %j', (datos) => {
    expect(() => validarFichaInstitucional(datos)).toThrow(BadRequestException);
  });
});
