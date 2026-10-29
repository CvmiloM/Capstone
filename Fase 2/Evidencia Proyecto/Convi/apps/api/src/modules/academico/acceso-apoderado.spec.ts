import { describe, it, expect, vi } from 'vitest';
import type { CuentaService } from '../../database/cuenta.service.js';
import type { Sesion } from '../../common/sesion.js';
import { validarVencimientoAcceso } from './acceso-apoderado.js';
import { AccesosApoderadoService } from './accesos-apoderado.service.js';

const id = '11111111-1111-4111-8111-111111111111';
const sesion = { codigo_perfil: 'ADMIN', aal: 'aal2' } as Sesion;

function entorno(
  opciones: {
    vigente?: boolean;
    perfil?: string;
    estadoCuenta?: string;
    estadoAcceso?: string;
    duplicado?: boolean;
    fechaValida?: boolean;
    sinCuenta?: boolean;
    sinVinculo?: boolean;
  } = {},
) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT persona_apoderado_id'))
      return {
        rows: opciones.sinVinculo
          ? []
          : [{ persona_apoderado_id: id, vigente: opciones.vigente ?? true }],
      };
    if (sql.includes('SELECT id,codigo_perfil,estado'))
      return {
        rows: opciones.sinCuenta
          ? []
          : [
              {
                id,
                codigo_perfil: opciones.perfil ?? 'APODERADO',
                estado: opciones.estadoCuenta ?? 'ACTIVO',
              },
            ],
      };
    if (sql.includes('AS valido'))
      return { rows: [{ valido: opciones.fechaValida ?? true }] };
    if (sql.includes('SELECT id FROM convi.accesos_apoderado'))
      return {
        rows: opciones.duplicado ? [{ id }] : [],
        rowCount: opciones.duplicado ? 1 : 0,
      };
    if (sql.includes('SELECT id,estado,to_char'))
      return {
        rows: [
          {
            id,
            estado: opciones.estadoAcceso ?? 'ACTIVO',
            expira_en: '2026-11-01T03:00:00.000000Z',
          },
        ],
      };
    if (sql.startsWith('INSERT')) return { rows: [{ id }] };
    if (sql.includes('count(*)')) return { rows: [{ total: '0' }] };
    return { rows: [] };
  });
  const operar = vi.fn(
    async (
      _s: unknown,
      _p: unknown,
      trabajo: (db: unknown) => Promise<unknown>,
    ) => trabajo({ query }),
  );
  return {
    servicio: new AccesosApoderadoService({
      operar,
    } as unknown as CuentaService),
    query,
    operar,
  };
}

describe('PB-115, permiso por estudiante y período', () => {
  it('acepta una fecha real, incluidos años bisiestos', () => {
    expect(validarVencimientoAcceso({ vence_el: '2028-02-29' })).toBe(
      '2028-02-29',
    );
  });
  it.each([
    null,
    {},
    [],
    { vence_el: '2026-02-29' },
    { vence_el: '2026-04-31' },
    { vence_el: '2026-11-01T00:00:00Z' },
    { vence_el: 20261101 },
    { vence_el: '0000-01-01' },
    { vence_el: '9999-12-31' },
    { vence_el: '2026-11-01', membresia_apoderado_id: id },
    { vence_el: '2026-11-01', establecimiento_id: id },
  ])(
    'rechaza fecha inválida o contexto enviado por el cliente %j',
    (cuerpo) => {
      expect(() => validarVencimientoAcceso(cuerpo)).toThrow();
    },
  );
  it.each([
    { sinVinculo: true },
    { sinCuenta: true },
    { perfil: 'PROFESOR' },
    { perfil: 'ADMIN' },
    { estadoCuenta: 'PENDIENTE' },
    { estadoCuenta: 'SUSPENDIDO' },
    { vigente: false },
  ])('no otorga sin vínculo y cuenta correctos %j', async (opciones) => {
    const e = entorno(opciones);
    await expect(
      e.servicio.otorgar(sesion, id, { vence_el: '2026-12-01' }),
    ).rejects.toThrow();
    expect(e.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(
      false,
    );
  });
  it('otorgar usa la cuenta encontrada en el vínculo, la escuela y el autor de la sesión', async () => {
    const e = entorno();
    expect(
      await e.servicio.otorgar(sesion, id, { vence_el: '2026-12-01' }),
    ).toEqual({ id });
    const sql =
      e.query.mock.calls.find(([s]) => s.startsWith('INSERT'))?.[0] ?? '';
    expect(sql).toContain('convi.establecimiento_actual()');
    expect(sql).toContain('convi.membresia_actual()');
    expect(e.operar.mock.calls[0][1]).toEqual({
      tipo: 'establecimiento',
      perfiles: ['ADMIN'],
    });
  });
  it('no crea dos permisos vigentes para el mismo vínculo', async () => {
    const e = entorno({ duplicado: true });
    await expect(
      e.servicio.otorgar(sesion, id, { vence_el: '2026-12-01' }),
    ).rejects.toThrow('ya tiene');
  });
  it('renovar no cambia el otorgante ni el período original', async () => {
    const e = entorno();
    await e.servicio.renovar(sesion, id, id, { vence_el: '2026-12-01' });
    const sql =
      e.query.mock.calls.find(([s]) => s.startsWith('UPDATE'))?.[0] ?? '';
    expect(sql).toContain('expira_en');
    expect(sql).not.toContain('otorgado_por=');
    expect(sql).not.toContain('otorgado_en=');
  });
  it.each([{ fechaValida: false }, { estadoAcceso: 'REVOCADO' }])(
    'renovar rechaza plazo menor o acceso revocado %j',
    async (opciones) => {
      const e = entorno(opciones);
      await expect(
        e.servicio.renovar(sesion, id, id, { vence_el: '2026-12-01' }),
      ).rejects.toThrow();
      expect(e.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(
        false,
      );
    },
  );
  it('una ficha antigua no modifica otro período', async () => {
    const e = entorno();
    await expect(
      e.servicio.renovar(sesion, id, '22222222-2222-4222-8222-222222222222', {
        vence_el: '2026-12-01',
      }),
    ).rejects.toThrow('actualiza');
  });
  it('revocar no depende de que la cuenta o el vínculo sigan habilitados', async () => {
    const e = entorno({ vigente: false, estadoCuenta: 'SUSPENDIDO' });
    await e.servicio.revocar(sesion, id, id, { confirmado: true });
    const sql =
      e.query.mock.calls.find(([s]) => s.startsWith('UPDATE'))?.[0] ?? '';
    expect(sql).toContain('revocado_por=convi.membresia_actual()');
    expect(sql).toContain("estado IN ('ACTIVO','PENDIENTE')");
    expect(sql).not.toContain('DELETE');
  });
  it('revocar requiere confirmación expresa', () => {
    const e = entorno();
    expect(() => e.servicio.revocar(sesion, id, id, {})).toThrow('Confirma');
    expect(e.operar).not.toHaveBeenCalled();
  });
  it.each([
    { buscar: 'x' },
    { buscar: 'x'.repeat(101) },
    { pagina: '0' },
    { pagina: '1e2' },
    { pagina: ['1'] },
    { pagina: '10001' },
    { escuela: id },
  ])('rechaza consultas inválidas %j', (consulta) => {
    const e = entorno();
    expect(() => e.servicio.listar(sesion, consulta)).toThrow();
  });
  it('la lista limita a 50 y usa parámetros para buscar', async () => {
    const e = entorno();
    expect(
      await e.servicio.listar(sesion, { buscar: "O'Hara", pagina: '2' }),
    ).toEqual({ apoderados: [], total: 0, pagina: 2, por_pagina: 50 });
    const sql = e.query.mock.calls.at(-1)?.[0] ?? '';
    expect(sql).toContain('LIMIT 50 OFFSET $2');
    expect(sql).not.toContain("O'Hara");
  });
});
