import {
  evaluarVariacion,
  explicacionVencidos,
  textoAvisoVariacion,
  textoAvisoVencidos,
  variacionPorcentual,
  yaAvisado,
} from './motor.js';
import type { PoolClient } from 'pg';
import type { CuentaService } from '../../database/cuenta.service.js';
import { MotorDiarioService } from './motor-diario.service.js';

// PB-091 y PB-092 (HU-079): el cálculo de las reglas diarias. Las consultas,
// la cuenta técnica y las alertas guardadas se prueban contra la base local.

/** Situaciones por día a partir de pares [día, cantidad]. */
const porDia = (...dias: [string, number][]) => new Map(dias);

const regla = {
  ventanaDias: 7,
  operador: 'GT' as const,
  umbral: 50,
  inicio: '2026-01-01',
};

describe('variacionPorcentual', () => {
  it('calcula la subida y la baja con dos decimales', () => {
    expect(variacionPorcentual(6, 3)).toBe(100);
    expect(variacionPorcentual(4, 3)).toBe(33.33);
    expect(variacionPorcentual(1, 4)).toBe(-75);
  });

  it('no se calcula si el período anterior tiene cero', () => {
    expect(variacionPorcentual(5, 0)).toBeNull();
  });
});

describe('evaluarVariacion', () => {
  it('compara los 7 días cerrados hasta ayer con los 7 anteriores', () => {
    const r = evaluarVariacion({
      ...regla,
      porDia: porDia(['2026-03-03', 2], ['2026-03-10', 4]),
      ayer: '2026-03-14',
    });
    expect(r).toEqual({
      actual: 4,
      anterior: 2,
      variacion: 100,
      periodoActual: { desde: '2026-03-08', hasta: '2026-03-14' },
      periodoAnterior: { desde: '2026-03-01', hasta: '2026-03-07' },
      cumpleDesde: '2026-03-10',
    });
  });

  it('no se cumple si la subida no pasa el umbral', () => {
    const r = evaluarVariacion({
      ...regla,
      porDia: porDia(['2026-03-03', 2], ['2026-03-10', 3]),
      ayer: '2026-03-14',
    });
    expect(r).toBeNull();
  });

  it('con el período anterior en cero no se calcula ni se cumple', () => {
    const r = evaluarVariacion({
      ...regla,
      porDia: porDia(['2026-03-10', 9]),
      ayer: '2026-03-14',
    });
    expect(r).toBeNull();
  });

  it('una baja se evalúa con un umbral negativo', () => {
    const r = evaluarVariacion({
      ...regla,
      operador: 'LE',
      umbral: -50,
      porDia: porDia(['2026-03-03', 4], ['2026-03-12', 1]),
      ayer: '2026-03-14',
    });
    expect(r?.variacion).toBe(-75);
    // El 9 de marzo el período anterior todavía tenía cero.
    expect(r?.cumpleDesde).toBe('2026-03-10');
  });

  it('la racha sigue mientras la variación se cumple día a día', () => {
    // Del 10 al 14 de marzo el período actual tiene 4 y el anterior 2.
    const datos = {
      ...regla,
      porDia: porDia(['2026-03-03', 2], ['2026-03-10', 4]),
    };
    expect(
      evaluarVariacion({ ...datos, ayer: '2026-03-12' })?.cumpleDesde,
    ).toBe('2026-03-10');
    expect(
      evaluarVariacion({ ...datos, ayer: '2026-03-14' })?.cumpleDesde,
    ).toBe('2026-03-10');
  });

  it('la racha no empieza antes de la vigencia y sin días vigentes no evalúa', () => {
    const datos = {
      ...regla,
      porDia: porDia(['2026-03-03', 2], ['2026-03-10', 4]),
      ayer: '2026-03-14',
    };
    expect(
      evaluarVariacion({ ...datos, inicio: '2026-03-13' })?.cumpleDesde,
    ).toBe('2026-03-13');
    expect(evaluarVariacion({ ...datos, inicio: '2026-03-15' })).toBeNull();
  });
});

describe('vencimientos', () => {
  const a = { tipo: 'compromisos' as const, id: 'a' };
  const b = { tipo: 'actuaciones' as const, id: 'b' };
  const c = { tipo: 'acciones_plan_intervencion' as const, id: 'c' };

  it('no repite si sigue vencido algo de lo que ya avisó una alerta anterior', () => {
    expect(yaAvisado([a, c], [[a, b]])).toBe(true);
    expect(yaAvisado([c], [[a, b]])).toBe(false);
    expect(yaAvisado([a], [])).toBe(false);
  });

  it('la explicación cuenta por tipo y guarda qué venció', () => {
    const x = explicacionVencidos({
      tipoRegla: 'FECHA_LIMITE',
      alCierreDe: '2026-03-14',
      operador: 'GE',
      umbral: 2,
      vencidos: [a, b, c],
    });
    expect(x.conteo).toBe(3);
    expect(x.por_tipo).toEqual({
      compromisos: 1,
      actuaciones: 1,
      acciones_plan_intervencion: 1,
    });
    expect(x.formula).toBe('vencidos al cierre del 2026-03-14 ≥ 2: 3 ≥ 2');
    expect(x.vencidos).toEqual([a, b, c]);
  });
});

describe('textos de los avisos', () => {
  it('el aviso de vencimientos es una oración sin datos de la persona', () => {
    const aviso = textoAvisoVencidos({
      tipoRegla: 'PLAZO_PROTOCOLO',
      codigoRegla: 'REGLA-004',
      nombre: 'Pasos atrasados',
      prioridad: 'ALTA',
      operador: 'GE',
      umbral: 1,
      conteo: 2,
    });
    expect(aviso.cuerpo).toBe(
      'Se cumplió la regla REGLA-004 con 2 pasos de protocolo vencidos de un caso, y la regla pide al menos 1',
    );
    expect(aviso.cuerpo).not.toMatch(/[.;]/);
  });

  it('el aviso de variación dice cuánto cambió entre los dos períodos', () => {
    const r = evaluarVariacion({
      ...regla,
      umbral: 30,
      porDia: porDia(['2026-03-03', 3], ['2026-03-10', 4]),
      ayer: '2026-03-14',
    })!;
    const aviso = textoAvisoVariacion({
      codigoRegla: 'REGLA-005',
      nombre: 'Subida semanal',
      prioridad: 'MEDIA',
      ambito: 'CURSO',
      ventanaDias: 7,
      operador: 'GT',
      umbral: 30,
      resultado: r,
    });
    expect(aviso.titulo).toBe('Alerta de prioridad media: Subida semanal');
    expect(aviso.cuerpo).toBe(
      'Se cumplió la regla REGLA-005: las situaciones de un curso pasaron de 3 a 4 entre dos períodos de 7 días (33,33 %), y la regla pide más de 30 %',
    );
  });
});

describe('cierre de reglas por cantidad', () => {
  function motorConRegla({
    hoy = '2026-11-28',
    cantidad = 2,
    yaAvisada = false,
  } = {}) {
    const regla = {
      id: 'regla',
      codigo_regla: 'REGLA-001',
      numero_version: 1,
      nombre: 'Acoso escolar',
      codigo_ambito: 'ESTUDIANTE',
      codigo_operador: 'GE',
      umbral: 3,
      dias_anteriores: 0,
      ventana_dias: null,
      categoria_id: 'categoria',
      categoria: 'Acoso escolar',
      codigo_accion: 'ALERTA',
      codigo_prioridad: 'MEDIA',
      vigente_desde: '2026-11-25',
      vigente_hasta: '2026-11-27',
    };
    const query = vi.fn((sql: string, _params?: unknown[]) => {
      if (sql.includes('current_date::text AS hoy'))
        return {
          rows: [
            { hoy, ayer: hoy === '2026-11-28' ? '2026-11-27' : '2026-11-26' },
          ],
        };
      if (sql.includes('FROM convi.reglas r'))
        return { rows: yaAvisada ? [] : [regla] };
      if (sql.includes('FROM convi.situaciones s'))
        return {
          rows: [{ registro: 'alumno', dia: '2026-11-27', n: cantidad }],
        };
      if (sql.includes('INSERT INTO convi.notificaciones'))
        return { rowCount: 2, rows: [] };
      if (sql.includes('INSERT INTO convi.alertas'))
        return { rows: [{ id: 'alerta' }] };
      return { rows: [] };
    });
    const db = { query } as unknown as PoolClient;
    const cuentas = {
      operarMotor: (_id: string, fn: (cliente: PoolClient) => unknown) =>
        fn(db),
    } as unknown as CuentaService;
    const motor = new MotorDiarioService(cuentas);
    const ejecutar = () => motor.evaluarEscuela('escuela');
    const avisos = () =>
      query.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO convi.notificaciones'),
      );
    return { ejecutar, avisos, query };
  }

  it('espera al día siguiente y el aviso cuenta hasta el último día completo', async () => {
    const antes = motorConRegla({ hoy: '2026-11-27' });
    await antes.ejecutar();
    expect(antes.avisos()).toHaveLength(0);
    const despues = motorConRegla();
    expect(await despues.ejecutar()).toMatchObject({
      alertas_generadas: 0,
      avisos_creados: 2,
    });
    expect(despues.query.mock.calls).toContainEqual([
      expect.stringContaining('s.ocurrido_en >= $2::date::timestamptz'),
      ['categoria', '2026-11-25', '2026-11-27'],
    ]);
    expect(despues.avisos()).toEqual([
      [
        expect.stringContaining(
          'ON CONFLICT (membresia_destinatario_id, clave_evento)',
        ),
        [
          'regla',
          'Terminó una regla sin cumplirse',
          expect.stringContaining('El mayor conteo al cierre fue 2'),
        ],
      ],
    ]);
  });

  it('al cumplirse en el último día genera la alerta normal en vez del aviso de cierre', async () => {
    const motor = motorConRegla({ cantidad: 3 });
    expect(await motor.ejecutar()).toMatchObject({
      alertas_generadas: 1,
      avisos_creados: 0,
    });
    expect(motor.avisos()).toHaveLength(0);
  });

  it('busca solo reglas cuyo cierre no fue avisado y que no generaron alertas', async () => {
    const motor = motorConRegla({ yaAvisada: true });
    await motor.ejecutar();
    const consulta = motor.query.mock.calls.find(([sql]) =>
      sql.includes('FROM convi.reglas r'),
    )?.[0];
    expect(consulta).toContain(
      'NOT EXISTS (SELECT 1 FROM convi.alertas a WHERE a.regla_id = r.id)',
    );
    expect(consulta).toContain("n.clave_evento = 'CIERRE_REGLA:' || r.id");
    expect(motor.avisos()).toHaveLength(0);
  });
});
