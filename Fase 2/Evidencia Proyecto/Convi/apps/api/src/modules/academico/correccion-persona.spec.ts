import { BadRequestException } from '@nestjs/common';
import { validarPersona } from './apoderado.js';
import { errorOtraPersona, esOtraPersona } from './correccion-persona.js';

const ficha = { nombres: 'Sofía Andrea', apellidos: 'Muñoz Rojas', rut: null };
const conRut = { ...ficha, rut: '12345678-5' };

describe('Corrección de fichas de personas (HU-016)', () => {
  it.each([
    ['solo los nombres', { ...ficha, nombres: 'Sofía' }],
    ['solo los apellidos', { ...ficha, apellidos: 'Muñoz' }],
    ['tildes, mayúsculas y espacios', { ...ficha, nombres: 'SOFIA  ANDREA' }],
    ['el RUT, agregándolo', { ...ficha, rut: '12345678-5' }],
  ])('acepta corregir %s', (_caso, despues) => {
    expect(esOtraPersona(ficha, despues)).toBe(false);
  });

  it('CA2: cambiar nombres y apellidos a la vez es otra persona', () => {
    const otra = { nombres: 'Pedro', apellidos: 'González', rut: null };
    expect(esOtraPersona(ficha, otra)).toBe(true);
    // Tampoco sirve agregar o cambiar el RUT en la misma corrección.
    expect(esOtraPersona(ficha, { ...otra, rut: '12345678-5' })).toBe(true);
    expect(esOtraPersona(conRut, { ...otra, rut: '11111111-1' })).toBe(true);
    expect(esOtraPersona(conRut, { ...otra, rut: null })).toBe(true);
  });

  it('con el mismo RUT registrado se acepta un cambio de nombre completo', () => {
    expect(
      esOtraPersona(conRut, {
        nombres: 'Tomás',
        apellidos: 'Rojas Muñoz',
        rut: '12345678-5',
      }),
    ).toBe(false);
  });

  it('el error marca nombres y apellidos con el mensaje del formulario', () => {
    const error = errorOtraPersona('No se guardó la ficha.');
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({
      mensaje: 'No se guardó la ficha.',
      errores: { nombres: expect.any(String), apellidos: expect.any(String) },
    });
  });

  it('CA3: el contacto se valida como al registrarlo, con su propio mensaje', () => {
    expect(
      validarPersona(
        {
          nombres: ' Ana ',
          apellidos: 'Prueba',
          rut: '12.345.678-5',
          correo: ' ANA@EXAMPLE.TEST ',
          direccion: ' ',
        },
        'No se guardaron los datos del contacto',
      ),
    ).toEqual({
      nombres: 'Ana',
      apellidos: 'Prueba',
      rut: '12345678-5',
      correo: 'ana@example.test',
      telefono: null,
      direccion: null,
    });
    try {
      validarPersona(
        { nombres: 'Ana', apellidos: 'Prueba', rut: '12345678-9' },
        'No se guardaron los datos del contacto',
      );
      expect.unreachable();
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        mensaje: 'No se guardaron los datos del contacto',
        errores: { rut: expect.any(String) },
      });
    }
  });
});
