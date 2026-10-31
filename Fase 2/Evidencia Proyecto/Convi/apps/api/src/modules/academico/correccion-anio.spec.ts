import { BadRequestException } from '@nestjs/common';
import { LARGO_MOTIVO, motivoDeCorreccion } from './curso.js';

// PB-023 (HU-018 CA1): en un año Cerrado los cursos y sus asignaciones solo
// cambian como corrección con motivo.
describe('PB-023: corrección en un año cerrado', () => {
  const mensaje = 'No se guardó.';

  it.each(['PLANIFICADO', 'ACTIVO'])(
    'en un año %s no pide motivo y lo ignora',
    (estado) => {
      expect(
        motivoDeCorreccion(
          { motivo: 'algo largo de sobra' },
          2026,
          estado,
          mensaje,
        ),
      ).toBeNull();
      expect(motivoDeCorreccion({}, 2026, estado, mensaje)).toBeNull();
    },
  );

  it('en un año cerrado devuelve el motivo sin espacios de más', () => {
    expect(
      motivoDeCorreccion(
        { motivo: '  Faltó registrar al profesor de reemplazo  ' },
        2025,
        'CERRADO',
        mensaje,
      ),
    ).toBe('Faltó registrar al profesor de reemplazo');
  });

  it.each([
    ['sin motivo', {}],
    ['con motivo muy corto', { motivo: 'error' }],
    ['con motivo muy largo', { motivo: 'x'.repeat(LARGO_MOTIVO.maximo + 1) }],
    ['con un motivo que no es texto', { motivo: 123 }],
  ])('en un año cerrado rechaza un pedido %s', (_caso, cuerpo) => {
    let error: unknown;
    try {
      motivoDeCorreccion(cuerpo, 2025, 'CERRADO', mensaje);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    const respuesta = (error as BadRequestException).getResponse() as {
      mensaje: string;
      errores: Record<string, string>;
    };
    expect(respuesta.mensaje).toBe(mensaje);
    expect(respuesta.errores.motivo).toContain('El año 2025 está cerrado');
  });
});
