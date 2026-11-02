import { BadRequestException } from '@nestjs/common';
import type { Contexto } from './contexto.js';
import {
  LARGO_MAXIMO_VALOR,
  leerCorreccion,
  validarCorreccion,
  validarMotivo,
} from './correccion.js';
import type { Revision } from './mapeo.js';
import { revisarFilas } from './revision.js';

// PB-024 y PB-025 (HU-019): corrección de filas y motivo de cancelar o
// restaurar una importación.

function errores(accion: () => unknown) {
  try {
    accion();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
      mensaje: string;
      errores: Record<string, string>;
    };
  }
  throw new Error('Se esperaba un error.');
}

describe('validarCorreccion', () => {
  const relacionados = ['codigo', 'nombre', 'nivel'];
  const delArchivo = { codigo: '1A', nombre: '1° básico A', nivel: 'B9' };

  it('guarda solo lo que cambia respecto del archivo', () => {
    expect(
      validarCorreccion(
        { valores: { codigo: ' 1A ', nivel: 'B1 ' } },
        relacionados,
        delArchivo,
      ),
    ).toEqual({ nivel: 'B1' });
  });

  it('acepta dejar vacío un campo que traía un valor', () => {
    expect(
      validarCorreccion({ valores: { nombre: '' } }, relacionados, delArchivo),
    ).toEqual({ nombre: '' });
  });

  it('sin cambios devuelve nada, para volver al archivo', () => {
    expect(
      validarCorreccion({ valores: {} }, relacionados, delArchivo),
    ).toEqual({});
    expect(validarCorreccion(null, relacionados, delArchivo)).toEqual({});
  });

  it('rechaza campos sin columna, valores que no son texto y valores largos', () => {
    const respuesta = errores(() =>
      validarCorreccion(
        {
          valores: {
            seccion: 'A',
            codigo: 5,
            nombre: 'x'.repeat(LARGO_MAXIMO_VALOR + 1),
          },
        },
        relacionados,
        delArchivo,
      ),
    );
    expect(respuesta.mensaje).toBe(
      'Revisa los datos marcados. No se guardó la corrección.',
    );
    expect(Object.keys(respuesta.errores).sort()).toEqual([
      'codigo',
      'nombre',
      'seccion',
    ]);
  });
});

describe('leerCorreccion', () => {
  it('lee lo guardado en datos_normalizados', () => {
    expect(
      leerCorreccion({
        valores: { nivel: 'B1', otro: 3 },
        por: 'm1',
        en: '2026-11-01T20:00:00+00:00',
      }),
    ).toEqual({
      valores: { nivel: 'B1' },
      por: 'm1',
      en: '2026-11-01T20:00:00+00:00',
    });
  });

  it('sin valores, quién o cuándo, no hay corrección', () => {
    expect(leerCorreccion(null)).toBeNull();
    expect(leerCorreccion({ valores: { nivel: 'B1' } })).toBeNull();
    expect(leerCorreccion({ valores: {}, por: 'm1', en: 'x' })).toBeNull();
  });
});

describe('validarMotivo', () => {
  it('exige de 10 a 500 caracteres', () => {
    expect(
      validarMotivo({ motivo: '  Archivo equivocado  ' }, 'cancelar'),
    ).toBe('Archivo equivocado');
    for (const motivo of [undefined, 'corto', 'x'.repeat(501)]) {
      const respuesta = errores(() => validarMotivo({ motivo }, 'restaurar'));
      expect(respuesta.mensaje).toBe(
        'Revisa los datos marcados. No se restauró la importación.',
      );
      expect(respuesta.errores.motivo).toContain('restauras');
    }
  });
});

describe('revisarFilas con correcciones', () => {
  const columnas = ['Código', 'Nombre', 'Nivel', 'Sección'];
  const revision: Revision = {
    mapeo: { Código: 'codigo', Nombre: 'nombre', Nivel: 'nivel' },
    anio_academico_id: '00000000-0000-4000-8000-000000000001',
    formato_fecha: 'DD-MM-AAAA',
    duplicados: 'USAR_EXISTENTE',
  };
  const contexto = {
    hoy: '2026-11-01',
    anio: {
      id: '00000000-0000-4000-8000-000000000001',
      anio: 2026,
      fecha_inicio: '2026-03-01',
      fecha_fin: '2026-12-20',
    },
    niveles: new Map([['B1', { activo: true }]]),
    cursos: new Map(),
  } as unknown as Contexto;
  const original = {
    Código: '1A',
    Nombre: '1° básico A',
    Nivel: 'B9',
    Sección: 'A',
  };

  it('la fila usa lo corregido y conserva la corrección', () => {
    const correccion = {
      valores: { nivel: 'b1', seccion: 'Z' },
      por: 'm1',
      en: '2026-11-01T20:00:00+00:00',
    };
    const [sin] = revisarFilas(
      'CURSOS',
      [{ numero_fila: 2, datos_originales: original }],
      columnas,
      revision,
      contexto,
    );
    const [con] = revisarFilas(
      'CURSOS',
      [{ numero_fila: 2, datos_originales: original, correccion }],
      columnas,
      revision,
      contexto,
    );
    expect(sin.estado).toBe('ERROR');
    expect(sin.correccion).toBeUndefined();
    expect(con.estado).toBe('VALIDO');
    expect(con.datos).toMatchObject({ codigo: '1A', nivel: 'B1' });
    // Sección no está relacionada: su corrección no se usa, pero se conserva.
    expect(con.datos.seccion).toBeNull();
    expect(con.correccion).toBe(correccion);
  });
});
