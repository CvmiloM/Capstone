import {
  claveEvento,
  cumple,
  diaDeNumero,
  evaluarRecurrencia,
  numeroDeDia,
  textoAviso,
} from './motor.js';

// PB-090 (HU-079 CA6): el cálculo de las reglas de cantidad. Las consultas, la
// cuenta técnica y las alertas guardadas se prueban contra la base local.

/** Situaciones por día a partir de una lista de días, con repetidos. */
function porDia(...dias: string[]) {
  const mapa = new Map<string, number>();
  for (const dia of dias) mapa.set(dia, (mapa.get(dia) ?? 0) + 1);
  return mapa;
}

const regla = {
  ventanaDias: 30,
  operador: 'GE' as const,
  umbral: 3,
  inicio: '2026-01-01',
};

describe('días', () => {
  it('suma y resta días sin horas, también al cambiar de mes y de año', () => {
    expect(diaDeNumero(numeroDeDia('2026-03-01') - 1)).toBe('2026-02-28');
    expect(diaDeNumero(numeroDeDia('2025-12-31') + 1)).toBe('2026-01-01');
  });
});

describe('cumple', () => {
  it('aplica cada operador', () => {
    expect(cumple(3, 'GE', 3)).toBe(true);
    expect(cumple(3, 'GT', 3)).toBe(false);
    expect(cumple(3, 'EQ', 3)).toBe(true);
    expect(cumple(4, 'EQ', 3)).toBe(false);
    expect(cumple(2, 'LT', 3)).toBe(true);
    expect(cumple(3, 'LE', 3)).toBe(true);
  });
});

describe('evaluarRecurrencia', () => {
  it('no se cumple con menos situaciones que el umbral', () => {
    const r = evaluarRecurrencia({
      ...regla,
      porDia: porDia('2026-03-01', '2026-03-05'),
      hoy: '2026-03-10',
    });
    expect(r).toBeNull();
  });

  it('se cumple el día de la tercera situación y la racha empieza ese día', () => {
    const r = evaluarRecurrencia({
      ...regla,
      porDia: porDia('2026-03-01', '2026-03-05', '2026-03-10'),
      hoy: '2026-03-10',
    });
    expect(r).toEqual({
      conteo: 3,
      desde: '2026-02-09',
      hasta: '2026-03-10',
      cumpleDesde: '2026-03-10',
    });
  });

  it('una cuarta situación dentro de la misma racha no cambia su comienzo', () => {
    const r = evaluarRecurrencia({
      ...regla,
      porDia: porDia('2026-03-01', '2026-03-05', '2026-03-10', '2026-03-20'),
      hoy: '2026-03-20',
    });
    expect(r?.conteo).toBe(4);
    expect(r?.cumpleDesde).toBe('2026-03-10');
  });

  it('si la primera sale de la ventana el mismo día que entra otra, la racha sigue', () => {
    // El 31 de marzo sale la del 1 de marzo y entra una nueva: el conteo sigue en 3.
    const r = evaluarRecurrencia({
      ...regla,
      porDia: porDia('2026-03-01', '2026-03-05', '2026-03-10', '2026-03-31'),
      hoy: '2026-03-31',
    });
    expect(r?.conteo).toBe(3);
    expect(r?.cumpleDesde).toBe('2026-03-10');
  });

  it('si la regla dejó de cumplirse un día, la racha nueva empieza después', () => {
    // El 31 de marzo y el 1 de abril quedan dos, el 2 de abril vuelve a haber tres.
    const r = evaluarRecurrencia({
      ...regla,
      porDia: porDia('2026-03-01', '2026-03-05', '2026-03-10', '2026-04-02'),
      hoy: '2026-04-02',
    });
    expect(r?.conteo).toBe(3);
    expect(r?.cumpleDesde).toBe('2026-04-02');
  });

  it('una situación registrada tarde mueve el comienzo de la racha hacia atrás', () => {
    const r = evaluarRecurrencia({
      ...regla,
      porDia: porDia('2026-03-01', '2026-03-02', '2026-03-03', '2026-03-10'),
      hoy: '2026-03-10',
    });
    expect(r?.cumpleDesde).toBe('2026-03-03');
  });

  it('la racha no empieza antes de la vigencia de la regla', () => {
    const r = evaluarRecurrencia({
      ...regla,
      inicio: '2026-03-08',
      porDia: porDia('2026-03-01', '2026-03-02', '2026-03-03', '2026-03-10'),
      hoy: '2026-03-10',
    });
    expect(r?.cumpleDesde).toBe('2026-03-08');
  });

  it('con «exactamente», una situación de más corta la racha', () => {
    const datos = {
      ...regla,
      operador: 'EQ' as const,
      hoy: '2026-03-12',
    };
    expect(
      evaluarRecurrencia({
        ...datos,
        porDia: porDia('2026-03-01', '2026-03-05', '2026-03-12'),
      })?.cumpleDesde,
    ).toBe('2026-03-12');
    expect(
      evaluarRecurrencia({
        ...datos,
        porDia: porDia('2026-03-01', '2026-03-05', '2026-03-10', '2026-03-12'),
      }),
    ).toBeNull();
  });

  it('cuenta varias situaciones del mismo día', () => {
    const r = evaluarRecurrencia({
      ...regla,
      ventanaDias: 1,
      porDia: porDia('2026-03-10', '2026-03-10', '2026-03-10'),
      hoy: '2026-03-10',
    });
    expect(r).toEqual({
      conteo: 3,
      desde: '2026-03-10',
      hasta: '2026-03-10',
      cumpleDesde: '2026-03-10',
    });
  });
});

describe('claveEvento y textoAviso', () => {
  it('la clave junta regla, versión, ámbito, registro y comienzo de la racha', () => {
    expect(
      claveEvento({
        codigoRegla: 'REGLA-001',
        version: 2,
        ambito: 'ESTABLECIMIENTO',
        registroId: null,
        cumpleDesde: '2026-03-10',
      }),
    ).toBe('REGLA-001:v2:ESTABLECIMIENTO:escuela:2026-03-10');
  });

  it('el aviso es una oración sin punto seguido ni datos de la persona', () => {
    const aviso = textoAviso({
      codigoRegla: 'REGLA-001',
      nombre: 'Tres situaciones en un mes',
      prioridad: 'ALTA',
      ambito: 'ESTUDIANTE',
      ventanaDias: 30,
      operador: 'GE',
      umbral: 3,
      conteo: 3,
    });
    expect(aviso.titulo).toBe(
      'Alerta de prioridad alta: Tres situaciones en un mes',
    );
    expect(aviso.cuerpo).toBe(
      'Se cumplió la regla REGLA-001 con 3 situaciones de un estudiante en los últimos 30 días, y la regla pide al menos 3',
    );
    expect(aviso.cuerpo).not.toMatch(/[.;]/);
  });
});
