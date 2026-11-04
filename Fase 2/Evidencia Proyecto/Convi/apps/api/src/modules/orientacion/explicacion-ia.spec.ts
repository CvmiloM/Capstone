import { ErrorIA } from '../normativa/consulta.js';
import {
  cifrasAjenas,
  ExplicacionRechazada,
  interpretarExplicacion,
  mensajesExplicacion,
  prepararAlerta,
  prepararComparacion,
  type AlertaParaExplicar,
} from './explicacion-ia.js';

// PB-122 y PB-123 (HU-104): la IA explica con los valores del servidor, sin
// nombres ni identificadores, y CONVI no muestra un texto que clasifique,
// prediga o escriba cifras que no están en el cálculo.

const ALERTA_CONTEO: AlertaParaExplicar = {
  codigo_regla: 'R-004',
  numero_version: 2,
  regla: 'Situaciones repetidas en 30 días',
  tipo_regla: 'RECURRENCIA',
  prioridad: 'ALTA',
  ambito: 'ESTUDIANTE',
  categoria: 'Agresión verbal',
  explicacion: {
    metrica: 'CONTEO_SITUACIONES',
    ambito: 'ESTUDIANTE',
    categoria_id: '5b0c7a8e-1111-4c2a-9d3e-000000000001',
    ventana_dias: 30,
    periodo: { desde: '2026-10-01', hasta: '2026-10-30' },
    conteo: 4,
    operador: 'GE',
    umbral: 3,
    formula: 'situaciones entre 2026-10-01 y 2026-10-30 ≥ 3: 4 ≥ 3',
    cumple_desde: '2026-10-28',
    situacion_evaluada_id: '5b0c7a8e-2222-4c2a-9d3e-000000000002',
  },
};

const ALERTA_VARIACION: AlertaParaExplicar = {
  ...ALERTA_CONTEO,
  tipo_regla: 'VARIACION',
  ambito: 'CURSO',
  explicacion: {
    metrica: 'VARIACION_PORCENTUAL',
    ambito: 'CURSO',
    categoria_id: null,
    ventana_dias: 14,
    periodo_actual: { desde: '2026-10-17', hasta: '2026-10-30' },
    periodo_anterior: { desde: '2026-10-03', hasta: '2026-10-16' },
    conteo_actual: 6,
    conteo_anterior: 4,
    variacion: 50,
    operador: 'GT',
    umbral: 25,
    formula: '(6 − 4) / 4 × 100 = 50 % > 25 %',
    cumple_desde: '2026-10-30',
  },
};

const ALERTA_VENCIDOS: AlertaParaExplicar = {
  ...ALERTA_CONTEO,
  tipo_regla: 'FECHA_LIMITE',
  ambito: 'CASO',
  explicacion: {
    metrica: 'CONTEO_VENCIDOS',
    ambito: 'CASO',
    tipo_regla: 'FECHA_LIMITE',
    al_cierre_de: '2026-11-03',
    conteo: 2,
    por_tipo: { compromisos: 1, actuaciones: 1 },
    operador: 'GE',
    umbral: 1,
    formula: 'vencidos al cierre del 2026-11-03 ≥ 1: 2 ≥ 1',
    vencidos: [
      { tipo: 'compromisos', id: '5b0c7a8e-3333-4c2a-9d3e-000000000003' },
      { tipo: 'actuaciones', id: '5b0c7a8e-4444-4c2a-9d3e-000000000004' },
    ],
  },
};

const COMPARACION = {
  desde: '2026-10-01',
  hasta: '2026-10-31',
  comparacion: {
    desde: '2026-08-31',
    hasta: '2026-09-30',
    dias: 31,
    indicadores: [
      {
        nombre: 'Situaciones',
        actual: 12,
        anterior: 8,
        variacion_porcentual: 50,
      },
      { nombre: 'Cierres', actual: 3, anterior: 0, variacion_porcentual: null },
      {
        nombre: 'Reaperturas',
        actual: 1,
        anterior: 2,
        variacion_porcentual: -50,
      },
    ],
  },
  curso: null,
  categoria: 'Agresión verbal',
};

const respuesta = (...parrafos: string[]) => JSON.stringify({ parrafos });

describe('Lo que recibe la IA de una alerta (PB-122)', () => {
  it('lleva la regla y el cálculo, sin identificadores ni a quién se refiere', () => {
    for (const alerta of [ALERTA_CONTEO, ALERTA_VARIACION, ALERTA_VENCIDOS]) {
      const { contexto } = prepararAlerta(alerta);
      const enviado = JSON.stringify(contexto);
      expect(enviado).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(enviado).not.toContain('situacion_evaluada_id');
      expect(enviado).not.toContain('categoria_id');
      expect(enviado).toContain('sin identificar');
      expect(enviado).toContain('R-004');
    }
  });

  it('muestra junto al texto los valores del conteo', () => {
    const { valores } = prepararAlerta(ALERTA_CONTEO);
    expect(valores).toContainEqual({
      nombre: 'Situaciones contadas',
      valor: '4',
      detalle: 'del 01-10-2026 al 30-10-2026, 30 días',
    });
    expect(valores).toContainEqual({
      nombre: 'La regla pide',
      valor: 'al menos 3',
    });
  });

  it('en la variación, el conteo anterior es el denominador', () => {
    const { contexto, valores } = prepararAlerta(ALERTA_VARIACION);
    expect(contexto.calculo).toMatchObject({
      conteo_actual: 6,
      conteo_anterior: 4,
      denominador: 4,
      variacion_porcentual: 50,
    });
    expect(
      valores.find((v) => v.nombre === 'Período anterior')?.detalle,
    ).toContain('denominador');
  });

  it('de los vencidos solo cuenta cuántos hay de cada tipo', () => {
    const { contexto } = prepararAlerta(ALERTA_VENCIDOS);
    expect(contexto.calculo).toMatchObject({
      conteo_vencidos: 2,
      vencidos_por_tipo: { compromisos: 1, actuaciones: 1 },
    });
    expect(JSON.stringify(contexto)).not.toContain('"vencidos":[');
  });
});

describe('Lo que recibe la IA de la comparación (PB-123)', () => {
  it('lleva período, valor y denominador de cada indicador', () => {
    const { contexto, valores, sinMovimiento } =
      prepararComparacion(COMPARACION);
    expect(sinMovimiento).toBe(false);
    expect(contexto.indicadores).toContainEqual({
      nombre: 'Situaciones',
      anterior: 8,
      actual: 12,
      denominador: 8,
      diferencia: 4,
      variacion_porcentual: 50,
    });
    expect(contexto.filtros).toEqual({
      curso: 'todos los cursos',
      categoria: 'Agresión verbal',
    });
    expect(valores.find((v) => v.nombre === 'Cierres')?.detalle).toBe(
      'Variación no calculable: el denominador es 0',
    );
    expect(valores.find((v) => v.nombre === 'Situaciones')).toEqual({
      nombre: 'Situaciones',
      valor: '8 → 12',
      detalle: 'Variación +50 %, denominador 8',
    });
  });

  it('acepta la variación como texto, como la entrega numeric', () => {
    const { contexto } = prepararComparacion({
      ...COMPARACION,
      comparacion: {
        ...COMPARACION.comparacion,
        indicadores: [
          {
            nombre: 'Situaciones',
            actual: 3,
            anterior: 2,
            variacion_porcentual: '50.0',
          },
        ],
      },
    });
    expect(contexto.indicadores).toMatchObject([{ variacion_porcentual: 50 }]);
  });

  it('sin movimiento en ningún período no hace falta la IA', () => {
    const { sinMovimiento } = prepararComparacion({
      ...COMPARACION,
      comparacion: {
        ...COMPARACION.comparacion,
        indicadores: COMPARACION.comparacion.indicadores.map((i) => ({
          ...i,
          actual: 0,
          anterior: 0,
          variacion_porcentual: null,
        })),
      },
    });
    expect(sinMovimiento).toBe(true);
  });

  it('las instrucciones repiten los límites de HU-104', () => {
    const [sistema, usuario] = mensajesExplicacion('COMPARACION', { a: 1 });
    expect(sistema.content).toContain('nunca clasifiques');
    expect(sistema.content).toContain('denominador');
    expect(usuario.content).toContain('"a": 1');
  });
});

describe('Revisión de lo que redactó la IA', () => {
  const { contexto } = prepararComparacion(COMPARACION);

  it('entrega un texto que usa solo las cifras del cálculo', () => {
    expect(
      interpretarExplicacion(
        respuesta(
          'Entre el 1 de octubre y el 31 de octubre de 2026 hubo 12 situaciones, frente a 8 en los 31 días anteriores: son 4 más, una variación de 50 % sobre un denominador de 8',
          '  Los cierres pasaron de 0 a 3,  pero la variación no se calcula porque el conteo anterior es cero  ',
        ),
        contexto,
      ),
    ).toEqual([
      'Entre el 1 de octubre y el 31 de octubre de 2026 hubo 12 situaciones, frente a 8 en los 31 días anteriores: son 4 más, una variación de 50 % sobre un denominador de 8',
      'Los cierres pasaron de 0 a 3, pero la variación no se calcula porque el conteo anterior es cero',
    ]);
  });

  it('no muestra una cifra que CONVI no calculó', () => {
    expect(
      cifrasAjenas('hubo 15 situaciones y 50,0 % de variación', contexto),
    ).toEqual(['15']);
    expect(() =>
      interpretarExplicacion(
        respuesta('Las situaciones subieron un 70 %'),
        contexto,
      ),
    ).toThrow(ExplicacionRechazada);
  });

  it.each([
    'El estudiante es conflictivo y por eso hubo más situaciones',
    'Las situaciones seguirán aumentando el próximo mes',
    'Probablemente el curso vuelva a tener 12 situaciones',
    'Podría tratarse de un trastorno de conducta',
  ])('no muestra "%s" (HU-104 CA2)', (texto) => {
    expect(() => interpretarExplicacion(respuesta(texto), contexto)).toThrow(
      ExplicacionRechazada,
    );
  });

  it('deja cada oración en su párrafo, sin punto seguido', () => {
    expect(
      interpretarExplicacion(
        respuesta(
          'Hubo 12 situaciones frente a 8. La variación fue de 50,0 %. ¿Y los cierres? Pasaron de 0 a 3.',
        ),
        contexto,
      ),
    ).toEqual([
      'Hubo 12 situaciones frente a 8.',
      'La variación fue de 50,0 %.',
      '¿Y los cierres?',
      'Pasaron de 0 a 3.',
    ]);
  });

  it('una respuesta sin el formato pedido cuenta como falla de la IA', () => {
    for (const malo of ['no es json', '{}', respuesta(), respuesta('   ')])
      expect(() => interpretarExplicacion(malo, contexto)).toThrow(ErrorIA);
  });

  it('corta en tres párrafos y en el largo máximo', () => {
    const largo = 'a'.repeat(900);
    const parrafos = interpretarExplicacion(
      respuesta(largo, 'b', 'c', 'd'),
      contexto,
    );
    expect(parrafos).toHaveLength(3);
    expect(parrafos[0].length).toBe(600);
    expect(parrafos[0].endsWith('…')).toBe(true);
  });
});
