import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { codigoAutomatico } from './codigo-automatico.js';

describe('códigos académicos automáticos', () => {
  it.each([
    ['nivel', 'NIV-003'],
    ['curso', 'CUR-0003'],
    ['estudiante', 'EST-000003'],
  ] as const)(
    'genera %s dentro del ámbito de la escuela',
    async (tipo, esperado) => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ siguiente: 3 }] });
      expect(
        await codigoAutomatico({ query } as unknown as PoolClient, tipo, 'c1'),
      ).toBe(esperado);
      expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
      expect(query.mock.calls[0][0]).toContain(
        'convi.establecimiento_actual()',
      );
      expect(query.mock.calls[1][0]).toContain(
        'establecimiento_id = convi.establecimiento_actual()',
      );
      if (tipo === 'curso') expect(query.mock.calls[1][1][1]).toBe('c1');
    },
  );
});
