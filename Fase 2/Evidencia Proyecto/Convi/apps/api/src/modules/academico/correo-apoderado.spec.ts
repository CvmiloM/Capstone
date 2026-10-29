import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sesion } from '../../common/sesion.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import { CuentasService } from '../cuentas/cuentas.service.js';
import { ApoderadosService } from './apoderados.service.js';
import { AccesosApoderadoService } from './accesos-apoderado.service.js';
import { comprobarCorreoApoderado } from './correo-apoderado.js';

const id = '11111111-1111-4111-8111-111111111111';
const sesion = { codigo_perfil: 'ADMIN', aal: 'aal2' } as Sesion;
const persona = {
  nombres: 'Madre',
  apellidos: 'Prueba',
  correo: 'equipo@example.test',
};
const vinculo = {
  persona,
  tipo_relacion: 'Madre',
  es_principal: false,
  puede_ser_contactado: true,
};

function entorno(conflicto = true) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('correo_apoderado_incompatible'))
      return { rows: [{ incompatible: conflicto }] };
    if (sql.includes('SELECT id,codigo_perfil,estado'))
      return {
        rows: [
          {
            id,
            codigo_perfil: 'APODERADO',
            estado: 'ACTIVO',
            correo_invitacion: persona.correo,
          },
        ],
      };
    return {
      rows: [
        { id, persona_apoderado_id: id, vigente: true, ...persona, rut: null },
      ],
    };
  });
  const cuentas = {
    operar: vi.fn(async (_s, _p, trabajo) => trabajo({ query })),
  } as unknown as CuentaService;
  const auth = vi.fn();
  return {
    query,
    cuentas,
    auth,
    supabase: {
      auth: { admin: { inviteUserByEmail: auth } },
    } as unknown as SupabaseClient,
  };
}

describe('Correo del apoderado separado del equipo de la escuela', () => {
  it('rechaza el correo ocupado con un error del campo correo', async () => {
    const { query } = entorno();
    const error = await comprobarCorreoApoderado(
      { query } as unknown as PoolClient,
      persona.correo,
    ).catch((e) => e);
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse().errores.correo).toContain(
      'cuenta activa en CONVI',
    );
    expect(query).toHaveBeenCalledWith(expect.any(String), [persona.correo]);
  });

  it('acepta un correo libre y permite contacto sin correo', async () => {
    const { query } = entorno(false);
    const db = { query } as unknown as PoolClient;
    await comprobarCorreoApoderado(db, null);
    expect(query).not.toHaveBeenCalled();
    await expect(
      comprobarCorreoApoderado(db, persona.correo),
    ).resolves.toBeUndefined();
  });

  it.each([
    'registrar',
    'vincular',
    'corregir',
    'invitar',
    'otorgar',
    'renovar',
  ])(
    'comprueba el correo antes de escribir o enviar una invitación al %s',
    async (operacion) => {
      const e = entorno();
      const fichas = new ApoderadosService(e.cuentas);
      const accesos = new AccesosApoderadoService(e.cuentas);
      const cuentas = new CuentasService(e.cuentas, e.supabase);
      const trabajo =
        operacion === 'registrar'
          ? () => fichas.crear(sesion, id, vinculo)
          : operacion === 'vincular'
            ? () =>
                fichas.crear(sesion, id, {
                  ...vinculo,
                  persona_apoderado_id: id,
                })
            : operacion === 'corregir'
              ? () => fichas.corregir(sesion, id, id, persona)
              : operacion === 'invitar'
                ? () => cuentas.invitarApoderado(sesion, id)
                : operacion === 'otorgar'
                  ? () =>
                      accesos.otorgar(sesion, id, { vence_el: '2027-12-31' })
                  : () =>
                      accesos.renovar(sesion, id, id, {
                        vence_el: '2027-12-31',
                      });
      await expect(trabajo()).rejects.toMatchObject({
        response: { errores: { correo: expect.any(String) } },
      });
      expect(
        e.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql)),
      ).toBe(false);
      expect(e.auth).not.toHaveBeenCalled();
    },
  );
});
