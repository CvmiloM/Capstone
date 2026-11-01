import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  buscarEstudiantesRegistro,
  leerBusquedaEstudiantes,
} from './estudiantes-registro.js';

describe('búsqueda acotada de estudiantes del registro', () => {
  it.each([
    { buscar: ['Ana'] },
    { buscar: 'a'.repeat(101) },
    { curso: 'otro' },
    { historico: true },
    { historico: 'todos' },
  ])('rechaza filtros inválidos %j', (entrada) => {
    expect(() => leerBusquedaEstudiantes(entrada)).toThrow(BadRequestException);
  });
  it('no consulta toda la escuela ante una búsqueda vacía', async () => {
    const query = vi.fn();
    expect(
      await buscarEstudiantesRegistro(
        { query } as unknown as PoolClient,
        leerBusquedaEstudiantes({}),
      ),
    ).toEqual({ estudiantes: [], hay_mas: false });
    expect(query).not.toHaveBeenCalled();
  });
  it('limita la respuesta a veinte y avisa si existen más coincidencias', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: Array.from({ length: 21 }, (_, id) => ({ id })),
    });
    const r = await buscarEstudiantesRegistro(
      { query } as unknown as PoolClient,
      leerBusquedaEstudiantes({ buscar: "O'Hara_%", historico: '1' }),
    );
    expect(r.estudiantes).toHaveLength(20);
    expect(r.hay_mas).toBe(true);
    expect(query.mock.calls.at(-1)![0]).toContain('LIMIT 21');
    expect(query.mock.calls.at(-1)![0]).not.toContain("O'Hara");
    expect(query.mock.calls.at(-1)![1]).toEqual([
      "%O'Hara\\_\\%%",
      null,
      true,
      '',
    ]);
  });
});
