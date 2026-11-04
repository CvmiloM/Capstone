import { ConflictException } from '@nestjs/common';
import { rechazoPublicado } from './publicado.js';

// PB-150 (HU-129 CA1): los rechazos de la base se prueban contra la base
// local en supabase/tests/documentos_publicados.sql; aquí, cómo los traduce
// la API.

const MENSAJE = 'Crea una versión nueva para corregirla.';
const deLaBase = (message: string, code = 'P0001') =>
  Object.assign(new Error(message), { code });

describe('Rechazo de cambios a lo publicado (PB-150, HU-129 CA1)', () => {
  it('traduce cada rechazo de la base a un conflicto con el mensaje dado', () => {
    for (const texto of [
      'Contenido publicado inmutable',
      'Una versión publicada no vuelve a borrador',
      'Pasos publicados inmutables',
      'No agregar pasos a versión publicada',
      'El informe publicado se conserva, crear nueva edición',
    ]) {
      const resultado = rechazoPublicado(deLaBase(texto), MENSAJE);
      expect(resultado).toBeInstanceOf(ConflictException);
      expect((resultado as ConflictException).message).toBe(MENSAJE);
    }
  });

  it('deja pasar los demás errores sin cambiarlos', () => {
    for (const error of [
      deLaBase('Explicar la rectificación'),
      deLaBase('Contenido publicado inmutable', '23505'),
      new Error('Contenido publicado inmutable'),
      null,
    ])
      expect(rechazoPublicado(error, MENSAJE)).toBe(error);
  });
});
