import pg, { type PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { EvaluacionReglas } from '../alertas/evaluacion.service.js';
import { ConvivenciaService, MAXIMO_BANDEJA } from './convivencia.service.js';

function servicio(responder: (sql: string) => Promise<unknown>) {
  const escape = new pg.Client();
  const query = vi.fn(responder);
  const cliente = {
    query,
    escapeLiteral: (valor: string) => escape.escapeLiteral(valor),
  } as unknown as PoolClient;
  const operar = vi.fn(
    (_sesion: Sesion, _acceso: unknown, trabajo: (db: PoolClient) => unknown) =>
      trabajo(cliente),
  );
  return {
    convivencia: new ConvivenciaService(
      { operar } as unknown as CuentaService,
      {} as EvaluacionReglas,
    ),
    operar,
    query,
  };
}

describe('lecturas agrupadas de Situaciones', () => {
  const sesion = {} as Sesion;

  it('conserva lista y totales de la bandeja al recibir ambos resultados juntos', async () => {
    const filas = [{ id: 'situacion', estudiantes: 2 }];
    const conteo = [{ estado: 'NUEVA', urgencia: 'NORMAL', total: 3 }];
    const { convivencia, operar, query } = servicio(async () => [
      { rows: filas },
      { rows: conteo },
    ]);
    await expect(
      convivencia.bandeja(sesion, undefined, undefined),
    ).resolves.toEqual({
      situaciones: filas,
      conteo,
      limite: MAXIMO_BANDEJA,
      pagina: 1,
      total: 3,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(operar.mock.calls[0][1]).toEqual({
      tipo: 'establecimiento',
      perfiles: ['CONVIVENCIA'],
    });
  });

  it('no entrega una bandeja parcial si falla alguna lectura', async () => {
    const error = new Error('Conexión interrumpida');
    const { convivencia } = servicio(async () => {
      throw error;
    });
    await expect(
      convivencia.bandeja(sesion, undefined, undefined),
    ).rejects.toBe(error);
  });

  it('rechaza un filtro desconocido antes de consultar la base', () => {
    const { convivencia, operar } = servicio(async () => ({ rows: [] }));
    expect(() => convivencia.bandeja(sesion, 'OTRA', undefined)).toThrow(
      'Filtro no válido',
    );
    expect(operar).not.toHaveBeenCalled();
  });

  it('no consulta datos adicionales de una situación inexistente o no visible', async () => {
    const { convivencia, query } = servicio(async () => ({ rows: [] }));
    await expect(
      convivencia.situacion(sesion, 'situacion'),
    ).rejects.toMatchObject({ status: 404 });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

// Mis situaciones y Sin responsable en la bandeja, y el botón Tomar.
describe('responsable en la bandeja', () => {
  const YO = '11111111-1111-4111-8111-111111111111';
  const OTRA = '22222222-2222-4222-8222-222222222222';
  const sesion = { membresia_id: YO } as Sesion;
  const conteo = [
    { estado: 'NUEVA', urgencia: 'NORMAL', responsable: 'mias', total: 2 },
    {
      estado: 'EN_REVISION',
      urgencia: 'URGENTE',
      responsable: 'mias',
      total: 1,
    },
    { estado: 'DESCARTADA', urgencia: 'NORMAL', responsable: 'mias', total: 4 },
    { estado: 'NUEVA', urgencia: 'NORMAL', responsable: 'sin', total: 5 },
    {
      estado: 'ANTECEDENTE',
      urgencia: 'NORMAL',
      responsable: 'otras',
      total: 7,
    },
  ];

  it.each([
    ['mias', 3, "('mias'::text IS NULL OR CASE"],
    ['sin', 5, "('sin'::text IS NULL OR CASE"],
    [undefined, 15, '(NULL::text IS NULL OR CASE'],
  ])(
    'con responsable %s filtra la lista y el total cuenta solo ese grupo',
    async (responsable, total, filtroEnviado) => {
      const { convivencia, query } = servicio(async () => [
        { rows: [] },
        { rows: conteo },
      ]);
      const bandeja = await convivencia.bandeja(
        sesion,
        undefined,
        undefined,
        responsable ? { responsable } : {},
      );
      expect(bandeja.total).toBe(total);
      expect(bandeja.conteo).toEqual(conteo);
      expect(query.mock.calls[0][0]).toContain(filtroEnviado);
    },
  );

  it('rechaza un responsable desconocido antes de consultar la base', () => {
    const { convivencia, operar } = servicio(async () => ({ rows: [] }));
    expect(() =>
      convivencia.bandeja(sesion, undefined, undefined, { responsable: 'yo' }),
    ).toThrow('Filtro no válido');
    expect(operar).not.toHaveBeenCalled();
  });

  function situacion(estado: string, responsable_id: string | null) {
    return servicio(async (sql) => {
      if (sql.includes('FOR UPDATE'))
        return { rows: [{ estado, responsable_id }] };
      if (sql.includes('FROM convi.membresias_establecimiento'))
        return { rows: [{}], rowCount: 1 };
      if (sql.startsWith('UPDATE convi.situaciones'))
        return {
          rows: [{ id: 's', estado, responsable_id: YO, codigo: 'SIT-1' }],
        };
      return { rows: [], rowCount: 0 };
    });
  }

  it('Tomar deja como responsable a quien consulta, como primera asignación', async () => {
    const { convivencia, query } = situacion('NUEVA', null);
    await expect(convivencia.tomar(sesion, 's')).resolves.toEqual({
      id: 's',
      estado: 'NUEVA',
      responsable_id: YO,
    });
    const llamada = (inicio: string) =>
      query.mock.calls.find(([sql]) => String(sql).includes(inicio));
    expect(llamada('UPDATE convi.situaciones')?.[1]).toEqual(['s', YO]);
    expect(llamada('app.motivo_cambio')?.[1]).toEqual([
      'Primera asignación del responsable de la revisión.',
    ]);
  });

  it.each([
    ['NUEVA', 'de otra persona', OTRA, 'Esta situación ya tiene responsable.'],
    ['NUEVA', 'propio', YO, 'Esta situación ya tiene responsable.'],
    ['ANTECEDENTE', 'vacío', null, 'La revisión de esta situación ya terminó'],
  ])(
    'Tomar no cambia una situación %s con responsable %s',
    async (estado, _nombre, responsable, mensaje) => {
      const { convivencia, query } = situacion(estado, responsable);
      await expect(convivencia.tomar(sesion, 's')).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining(mensaje),
      });
      expect(
        query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE')),
      ).toBe(false);
    },
  );
});
