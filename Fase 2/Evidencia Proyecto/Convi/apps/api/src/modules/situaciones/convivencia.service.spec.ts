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
