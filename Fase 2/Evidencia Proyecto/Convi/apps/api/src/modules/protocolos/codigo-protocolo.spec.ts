import type { Sesion } from '../../common/sesion.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import { ProtocolosService } from './protocolos.service.js';

describe('AD-004: código automático de protocolo', () => {
  const sesion = {} as Sesion;
  function escenario() {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('AS siguiente')) return { rows: [{ siguiente: 12 }] };
      if (sql.includes('INSERT INTO convi.protocolos'))
        return { rows: [{ id: 'protocolo' }] };
      if (sql.includes('INSERT INTO convi.versiones_protocolo'))
        return { rows: [{ id: 'version' }] };
      throw new Error('Consulta inesperada');
    });
    const operar = vi.fn(
      async (
        _s: unknown,
        _p: unknown,
        trabajo: (db: unknown) => Promise<unknown>,
      ) => trabajo({ query }),
    );
    return {
      query,
      operar,
      servicio: new ProtocolosService({ operar } as unknown as CuentaService),
    };
  }

  it('crea con nombre, genera en servidor y conserva el primer borrador', async () => {
    const e = escenario();
    expect(
      await e.servicio.crear(sesion, {
        nombre: 'Resolución dialogada de conflictos',
      }),
    ).toEqual({ id: 'protocolo', version_id: 'version' });
    expect(e.operar).toHaveBeenCalledWith(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      expect.any(Function),
      'READ COMMITTED',
    );
    expect(e.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(e.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO convi.protocolos'),
      ['PROT-012', 'Resolución dialogada de conflictos'],
    );
    expect(e.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO convi.versiones_protocolo'),
      ['protocolo'],
    );
  });

  it('mantiene compatibilidad con códigos manuales de clientes anteriores', async () => {
    const e = escenario();
    await e.servicio.crear(sesion, {
      nombre: 'Convivencia digital',
      codigo: ' p-digital ',
    });
    expect(e.query).toHaveBeenCalledTimes(2);
    expect(e.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO convi.protocolos'),
      ['P-DIGITAL', 'Convivencia digital'],
    );
  });

  it('rechaza un nombre vacío antes de operar en la base', () => {
    const e = escenario();
    expect(() => e.servicio.crear(sesion, { nombre: ' ' })).toThrow();
    expect(e.operar).not.toHaveBeenCalled();
  });
});
