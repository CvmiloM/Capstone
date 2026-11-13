import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import {
  CuentaService,
  type AccesoRegistro,
} from '../../database/cuenta.service.js';
import { CuentasService } from './cuentas.service.js';

const actor = '00000000-0000-4000-8000-000000000001';
const otra = '00000000-0000-4000-8000-000000000002';
const sesion = {
  membresia_id: actor,
  codigo_perfil: 'ADMIN',
  aal: 'aal2',
} as Sesion;

function preparar() {
  const query = vi.fn();
  const operar = vi.fn(
    async (
      _sesion: Sesion,
      _acceso: AccesoRegistro,
      trabajo: (db: PoolClient) => Promise<unknown>,
    ) => trabajo({ query } as unknown as PoolClient),
  );
  const invitar = vi.fn().mockResolvedValue({ error: null });
  const servicio = new CuentasService(
    { operar } as unknown as CuentaService,
    {
      auth: { admin: { inviteUserByEmail: invitar } },
    } as unknown as SupabaseClient,
  );
  return { servicio, query, operar, invitar };
}

describe('Administradores adicionales (AD-005)', () => {
  it('invita un administrador pendiente mediante el flujo existente de activación', async () => {
    const { servicio, query, operar, invitar } = preparar();
    const cuenta = {
      id: otra,
      correo: 'paula.rojas@example.test',
      perfil: 'ADMIN',
      estado: 'PENDIENTE',
    };
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'persona' }] })
      .mockResolvedValueOnce({ rows: [cuenta] });
    await expect(
      servicio.invitar(sesion, {
        nombres: 'Paula',
        apellidos: 'Rojas',
        correo: cuenta.correo,
        perfil: 'ADMIN',
      }),
    ).resolves.toEqual(cuenta);
    expect(operar.mock.calls[0][1]).toEqual({
      tipo: 'establecimiento',
      perfiles: ['ADMIN'],
    });
    expect(query.mock.calls[3][1]).toEqual(['persona', 'ADMIN', cuenta.correo]);
    expect(invitar).toHaveBeenCalledWith(cuenta.correo, {
      data: { membresia_id: otra },
    });
  });

  it('impide suspender la cuenta propia, incluida la del único administrador', async () => {
    const { servicio, query } = preparar();
    await expect(servicio.suspender(sesion, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('suspende otra cuenta actualizando la membresía, sin borrar personas ni historia', async () => {
    const { servicio, query } = preparar();
    query
      .mockResolvedValueOnce({ rows: [{ estado: 'ACTIVO' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(servicio.suspender(sesion, otra)).resolves.toEqual({
      id: otra,
      estado: 'SUSPENDIDO',
    });
    expect(query.mock.calls[1][0]).toMatch(
      /^UPDATE convi\.membresias_establecimiento SET estado/,
    );
    expect(query.mock.calls[1][1]).toEqual([otra, 'SUSPENDIDO']);
    expect(query.mock.calls).toHaveLength(2);
  });

  it('reactiva con motivo para la auditoría y conserva la misma membresía', async () => {
    const { servicio, query } = preparar();
    query
      .mockResolvedValueOnce({ rows: [{ estado: 'SUSPENDIDO' }] })
      .mockResolvedValue({ rows: [] });
    await expect(
      servicio.reactivar(sesion, otra, { motivo: 'Retoma sus funciones' }),
    ).resolves.toEqual({ id: otra, estado: 'ACTIVO' });
    expect(query.mock.calls[1][1]).toEqual(['Retoma sus funciones']);
    expect(query.mock.calls[2][1]).toEqual([otra, 'ACTIVO']);
  });

  it('no revela una cuenta que la seguridad por escuela no devuelve', async () => {
    const { servicio, query } = preparar();
    query.mockResolvedValue({ rows: [] });
    await expect(servicio.suspender(sesion, otra)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each(['40001', '40P01'])(
    'informa el conflicto concurrente %s sin afirmar que suspendió',
    async (code) => {
      const { servicio, query } = preparar();
      query.mockRejectedValue({ code });
      await expect(servicio.suspender(sesion, otra)).rejects.toBeInstanceOf(
        ConflictException,
      );
    },
  );
});
