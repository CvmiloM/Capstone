import { BadRequestException } from '@nestjs/common';
import {
  LARGO_MAXIMO_OBSERVACION_ALERTA,
  leerFiltrosAlertas,
  leerFiltrosAvisos,
  validarRevisionAlerta,
} from './atencion.js';

// PB-093 (HU-080) y PB-095 (HU-082): las reglas viven en el servidor (HU-119).
// Estas pruebas envían datos que la pantalla nunca mandaría. Lo que depende de
// la base (Convivencia activa, alerta Nueva, huella, destinatario del aviso y
// auditoría) lo revisa el servicio y la base vuelve a exigirlo.
const VERSION = 'a'.repeat(32);

function errores(prueba: () => unknown): Record<string, string> {
  try {
    prueba();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const cuerpo = (error as BadRequestException).getResponse() as {
      errores: Record<string, string>;
    };
    return cuerpo.errores;
  }
  throw new Error('Se esperaba un rechazo');
}

describe('Revisión de alertas (PB-093, HU-080)', () => {
  it('acepta Revisada o Archivada con lo que se hizo (CA2)', () => {
    for (const estado of ['REVISADA', 'ARCHIVADO'] as const)
      expect(
        validarRevisionAlerta({
          estado_nuevo: estado,
          observacion: '  Se conversó con el profesor jefe.  ',
          version: VERSION,
        }),
      ).toEqual({
        estado_nuevo: estado,
        observacion: 'Se conversó con el profesor jefe.',
        version: VERSION,
      });
  });

  it('no vuelve a Nueva ni acepta otros estados', () => {
    for (const estado of ['NUEVA', 'ARCHIVADA', 'otro', undefined])
      expect(
        errores(() =>
          validarRevisionAlerta({
            estado_nuevo: estado,
            observacion: 'Revisada',
            version: VERSION,
          }),
        ),
      ).toHaveProperty('estado_nuevo');
  });

  it('exige escribir qué se hizo, hasta el largo máximo (CA2)', () => {
    for (const observacion of [undefined, '', '   ', 42])
      expect(
        errores(() =>
          validarRevisionAlerta({
            estado_nuevo: 'REVISADA',
            observacion,
            version: VERSION,
          }),
        ),
      ).toHaveProperty('observacion');
    expect(
      errores(() =>
        validarRevisionAlerta({
          estado_nuevo: 'REVISADA',
          observacion: 'x'.repeat(LARGO_MAXIMO_OBSERVACION_ALERTA + 1),
          version: VERSION,
        }),
      ),
    ).toHaveProperty('observacion');
    expect(
      validarRevisionAlerta({
        estado_nuevo: 'REVISADA',
        observacion: 'x'.repeat(LARGO_MAXIMO_OBSERVACION_ALERTA),
        version: VERSION,
      }).observacion,
    ).toHaveLength(LARGO_MAXIMO_OBSERVACION_ALERTA);
  });

  it('exige la huella de la alerta que se veía (PB-139)', () => {
    for (const version of [undefined, '', 'abc', 'g'.repeat(32)])
      expect(
        errores(() =>
          validarRevisionAlerta({
            estado_nuevo: 'REVISADA',
            observacion: 'Revisada',
            version,
          }),
        ),
      ).toHaveProperty('estado_nuevo');
  });
});

describe('Filtros de la bandeja de alertas y de los avisos', () => {
  it('la bandeja muestra las Nuevas al entrar y acepta los demás estados', () => {
    expect(leerFiltrosAlertas({})).toEqual({ estado: 'NUEVA', pagina: 1 });
    expect(leerFiltrosAlertas({ estado: 'ARCHIVADO', pagina: '3' })).toEqual({
      estado: 'ARCHIVADO',
      pagina: 3,
    });
    expect(leerFiltrosAlertas({ estado: 'TODAS' }).estado).toBeNull();
    for (const consulta of [
      { estado: 'BORRADOR' },
      { estado: ['NUEVA'] },
      { pagina: '0' },
      { pagina: '-1' },
      { pagina: '1.5' },
      { pagina: '12345678' },
    ])
      expect(() => leerFiltrosAlertas(consulta)).toThrow(BadRequestException);
  });

  it('los avisos muestran los no leídos al entrar, o todos (HU-082)', () => {
    expect(leerFiltrosAvisos({})).toEqual({ todos: false, pagina: 1 });
    expect(leerFiltrosAvisos({ ver: 'todos', pagina: '2' })).toEqual({
      todos: true,
      pagina: 2,
    });
    for (const consulta of [
      { ver: 'leidos' },
      { ver: ['todos'] },
      { pagina: 'x' },
    ])
      expect(() => leerFiltrosAvisos(consulta)).toThrow(BadRequestException);
  });
});
