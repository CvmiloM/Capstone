import { BadRequestException } from '@nestjs/common';
import {
  LARGO_MAXIMO_MEJORAR,
  leerAvance,
  mismoNivel,
  NIVELES_GUIA,
  secciones,
  validarBienvenida,
  validarCursosGuia,
  validarVersion,
} from './guia.js';

// PB-032 (HU-025), PB-034 (HU-027) y PB-038 (HU-031): las reglas viven en el
// servidor (HU-119). Lo que depende de la base (huella vigente, guía no
// terminada, niveles y cursos existentes) se probó contra la base local.
const VERSION = 'a'.repeat(32);

function errores(prueba: () => unknown): Record<string, string> {
  try {
    prueba();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (
      (error as BadRequestException).getResponse() as {
        errores: Record<string, string>;
      }
    ).errores;
  }
  throw new Error('Se esperaba un rechazo');
}

describe('Bienvenida de la guía (PB-032, HU-025)', () => {
  it('guardar exige elegir una opción, y Otro exige explicarla (CA3)', () => {
    expect(
      validarBienvenida({
        accion: 'GUARDAR',
        metodo: 'PLANILLAS',
        otro: 'no se guarda',
        mejorar: '  Encontrar rápido los antecedentes. ',
        version: VERSION,
      }),
    ).toEqual({
      accion: 'GUARDAR',
      metodo: 'PLANILLAS',
      otro: null,
      mejorar: 'Encontrar rápido los antecedentes.',
      version: VERSION,
    });
    expect(
      errores(() => validarBienvenida({ accion: 'GUARDAR', version: VERSION })),
    ).toHaveProperty('metodo');
    expect(
      errores(() =>
        validarBienvenida({
          accion: 'GUARDAR',
          metodo: 'OTRO',
          version: VERSION,
        }),
      ),
    ).toHaveProperty('otro');
    expect(
      errores(() =>
        validarBienvenida({
          accion: 'GUARDAR',
          metodo: 'PLANILLAS',
          mejorar: 'x'.repeat(LARGO_MAXIMO_MEJORAR + 1),
          version: VERSION,
        }),
      ),
    ).toHaveProperty('mejorar');
  });

  it('omitir no guarda respuestas (CA4)', () => {
    expect(
      validarBienvenida({
        accion: 'OMITIR',
        metodo: 'PLANILLAS',
        version: VERSION,
      }),
    ).toEqual({ accion: 'OMITIR', version: VERSION });
  });

  it('exige la huella de la guía que se veía (PB-139)', () => {
    for (const version of [undefined, '', 'abc'])
      expect(() => validarBienvenida({ accion: 'OMITIR', version })).toThrow(
        BadRequestException,
      );
    expect(() => validarVersion({})).toThrow(BadRequestException);
    expect(validarVersion({ version: VERSION })).toBe(VERSION);
  });
});

describe('Avance de la guía (PB-038, HU-031)', () => {
  it('sin avance todo está pendiente y se empieza por la bienvenida (CA2)', () => {
    const avance = leerAvance({});
    expect(avance.iniciada).toBe(false);
    expect(avance.paso_actual).toBe('bienvenida');
    expect(avance.pasos.every((p) => p.estado === 'PENDIENTE')).toBe(true);
  });

  it('retoma en el primer paso pendiente; omitido no es listo (CA3)', () => {
    const avance = leerAvance({
      iniciada_en: '2026-11-01T15:00:00Z',
      pasos: {
        bienvenida: { estado: 'LISTO', en: '2026-11-01T15:00:00Z', por: 'm' },
        equipo: { estado: 'OMITIDO', en: '2026-11-01T15:01:00Z', por: 'm' },
        cursos: { estado: 'otro' },
      },
    });
    expect(avance.iniciada).toBe(true);
    expect(avance.paso_actual).toBe('cursos');
    expect(avance.pasos.map((p) => p.estado)).toEqual([
      'LISTO',
      'OMITIDO',
      'PENDIENTE',
      'PENDIENTE',
      'PENDIENTE',
      'PENDIENTE',
      'PENDIENTE',
    ]);
  });

  it('un avance con otra forma cuenta como pendiente', () => {
    for (const contexto of [null, 'x', [], { pasos: [] }, { pasos: 'x' }])
      expect(leerAvance(contexto).paso_actual).toBe('bienvenida');
  });
});

describe('Año, niveles y cursos desde la guía (PB-034, HU-027)', () => {
  it('propone Básica de 1° a 8° y Media de 1° a 4° con su tramo (CA1)', () => {
    expect(NIVELES_GUIA).toHaveLength(12);
    expect(NIVELES_GUIA[0]).toEqual({
      clave: 'BASICA-1',
      nombre: '1° básico',
      ciclo: 'BASICA',
      tramo: 'PRIMER_CICLO',
    });
    expect(NIVELES_GUIA.find((n) => n.clave === 'BASICA-5')?.tramo).toBe(
      'SEGUNDO_CICLO',
    );
    expect(NIVELES_GUIA.find((n) => n.clave === 'MEDIA-3')?.tramo).toBe(
      'FORMACION_DIFERENCIADA',
    );
    expect(secciones(3)).toEqual(['A', 'B', 'C']);
  });

  it('valida año, niveles y secciones, y el servidor pone los nombres', () => {
    const datos = validarCursosGuia({
      anio: '2026',
      fecha_inicio: '2026-03-01',
      fecha_fin: '',
      activar: true,
      niveles: [
        { clave: 'BASICA-1', secciones: 2, nombre: 'otro nombre' },
        { clave: 'MEDIA-4', secciones: '1' },
      ],
      version: VERSION,
    });
    expect(datos).toMatchObject({
      anio: 2026,
      fecha_inicio: '2026-03-01',
      fecha_fin: null,
      activar: true,
    });
    expect(datos.niveles.map((n) => [n.nivel.nombre, n.secciones])).toEqual([
      ['1° básico', 2],
      ['4° medio', 1],
    ]);
  });

  it('rechaza niveles desconocidos, repetidos o con secciones fuera de rango', () => {
    for (const niveles of [
      [],
      [{ clave: 'PARVULARIA-1', secciones: 1 }],
      [
        { clave: 'BASICA-1', secciones: 1 },
        { clave: 'BASICA-1', secciones: 2 },
      ],
      [{ clave: 'BASICA-1', secciones: 0 }],
      [{ clave: 'BASICA-1', secciones: 7 }],
      [{ clave: 'BASICA-1', secciones: 1.5 }],
    ])
      expect(
        errores(() =>
          validarCursosGuia({ anio: 2026, niveles, version: VERSION }),
        ),
      ).toHaveProperty('niveles');
    expect(
      errores(() =>
        validarCursosGuia({
          anio: 1990,
          niveles: [{ clave: 'BASICA-1', secciones: 1 }],
          version: VERSION,
        }),
      ),
    ).toHaveProperty('anio');
    expect(
      errores(() =>
        validarCursosGuia({
          anio: 2026,
          fecha_inicio: '2026-12-01',
          fecha_fin: '2026-03-01',
          niveles: [{ clave: 'BASICA-1', secciones: 1 }],
          version: VERSION,
        }),
      ),
    ).toHaveProperty('fecha_fin');
  });
});

describe('Niveles que ya existen con otro nombre (PB-034, HU-027 CA3)', () => {
  it('reconoce el mismo nivel escrito distinto', () => {
    expect(mismoNivel('I medio', '1° medio')).toBe(true);
    expect(mismoNivel('IV Medio', '4° medio')).toBe(true);
    expect(mismoNivel('1º Básico', '1° básico')).toBe(true);
    expect(mismoNivel('1. basico', '1° básico')).toBe(true);
    expect(mismoNivel('VIII básico', '8° básico')).toBe(true);
  });

  it('no confunde niveles distintos', () => {
    expect(mismoNivel('II medio', '1° medio')).toBe(false);
    expect(mismoNivel('1° básico', '1° medio')).toBe(false);
    expect(mismoNivel('Inicial medio', '1° medio')).toBe(false);
  });
});
