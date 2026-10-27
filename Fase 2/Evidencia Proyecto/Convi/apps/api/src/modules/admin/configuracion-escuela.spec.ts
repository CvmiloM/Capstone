import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { validarConfiguracionEscuela } from './configuracion-escuela.js';
import { EstablecimientoService } from './establecimiento.service.js';

const base = {
  zona_horaria: 'America/Santiago',
  plazo_cierre_dias: '7',
  actualizado_en: '2026-10-27 12:00:00.123456+00',
};

describe('PB-028: configuración de la escuela', () => {
  it.each([
    'America/Santiago',
    'America/Coyhaique',
    'America/Punta_Arenas',
    'Pacific/Easter',
    'UTC',
  ])('acepta la zona IANA %s', (zona_horaria) => {
    expect(
      validarConfiguracionEscuela({ ...base, zona_horaria }).zona_horaria,
    ).toBe(zona_horaria);
  });
  it('normaliza los campos sin perder microsegundos de la versión', () => {
    expect(
      validarConfiguracionEscuela({
        ...base,
        zona_horaria: ' America/Santiago ',
        plazo_cierre_dias: ' 7 ',
      }),
    ).toEqual({ ...base, plazo_cierre_dias: 7 });
  });
  it.each([null, '', '  '])(
    'retira el plazo cuando viene vacío: %s',
    (plazo_cierre_dias) => {
      expect(
        validarConfiguracionEscuela({ ...base, plazo_cierre_dias })
          .plazo_cierre_dias,
      ).toBeNull();
    },
  );
  it.each([1, 7, '30'])(
    'acepta días enteros positivos: %s',
    (plazo_cierre_dias) => {
      expect(
        validarConfiguracionEscuela({ ...base, plazo_cierre_dias })
          .plazo_cierre_dias,
      ).toBe(Number(plazo_cierre_dias));
    },
  );
  it.each([
    null,
    [],
    'texto',
    { ...base, id: 'otra-escuela' },
    { ...base, nombre: 'otra' },
    { ...base, zona_horaria: '' },
    { ...base, zona_horaria: 'Chile inventado' },
    { ...base, zona_horaria: true },
    { ...base, zona_horaria: '+03:00' },
    { ...base, plazo_cierre_dias: 0 },
    { ...base, plazo_cierre_dias: -1 },
    { ...base, plazo_cierre_dias: 1.5 },
    { ...base, plazo_cierre_dias: '1e2' },
    { ...base, plazo_cierre_dias: '7 días' },
    { ...base, plazo_cierre_dias: true },
    { ...base, plazo_cierre_dias: undefined },
    { ...base, plazo_cierre_dias: '2147483648' },
    { ...base, actualizado_en: 'ayer' },
    { ...base, actualizado_en: undefined },
  ])('rechaza datos inválidos o fuera del alcance: %j', (datos) => {
    expect(() => validarConfiguracionEscuela(datos)).toThrow(
      BadRequestException,
    );
  });
});

function preparar() {
  const query = vi.fn();
  const operar = vi.fn(
    async (
      _s: Sesion,
      _a: unknown,
      trabajo: (db: PoolClient) => Promise<unknown>,
    ) => trabajo({ query } as unknown as PoolClient),
  );
  const servicio = new EstablecimientoService({
    operar,
  } as unknown as CuentaService);
  const sesion = { establecimiento_id: 'escuela-de-la-sesion' } as Sesion;
  return { query, operar, servicio, sesion };
}

describe('PB-028: guardado autorizado y sin sobrescritura', () => {
  it('cambia solo la configuración de la escuela de la sesión', async () => {
    const { query, operar, servicio, sesion } = preparar();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: sesion.establecimiento_id }] });
    expect(await servicio.editarConfiguracion(sesion, base)).toEqual({
      id: sesion.establecimiento_id,
    });
    expect(operar).toHaveBeenCalledWith(
      sesion,
      { tipo: 'establecimiento', perfiles: ['ADMIN'] },
      expect.any(Function),
    );
    expect(query.mock.calls[1][0]).toContain(
      'actualizado_en = $4::timestamptz',
    );
    expect(query.mock.calls[1][1]).toEqual([
      'America/Santiago',
      7,
      sesion.establecimiento_id,
      base.actualizado_en,
    ]);
    expect(
      query.mock.calls.some(([sql]) => /UPDATE convi\.casos/.test(sql)),
    ).toBe(false);
  });
  it('no comprueba fecha cuando no hay plazo ni inventa una fecha límite', async () => {
    const { query, servicio, sesion } = preparar();
    query.mockResolvedValueOnce({ rows: [{ id: sesion.establecimiento_id }] });
    await servicio.editarConfiguracion(sesion, {
      ...base,
      plazo_cierre_dias: null,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1][1]).toBeNull();
  });
  it.each([true, false, null])(
    'resuelve sin cambios, versión vieja y escuela ausente: %s',
    async (vigente) => {
      const { query, servicio, sesion } = preparar();
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: vigente === null ? [] : [{ vigente }] });
      const resultado = servicio.editarConfiguracion(sesion, {
        ...base,
        plazo_cierre_dias: null,
      });
      if (vigente === true)
        expect(await resultado).toEqual({ id: sesion.establecimiento_id });
      else
        await expect(resultado).rejects.toBeInstanceOf(
          vigente === null ? NotFoundException : ConflictException,
        );
    },
  );
  it.each(['40001', '40P01', '22008', '22023'])(
    'traduce el error de base %s sin ocultarlo como éxito',
    async (code) => {
      const { query, servicio, sesion } = preparar();
      query.mockRejectedValueOnce({ code });
      await expect(
        servicio.editarConfiguracion(sesion, base),
      ).rejects.toBeInstanceOf(
        ['40001', '40P01'].includes(code)
          ? ConflictException
          : BadRequestException,
      );
    },
  );
});
