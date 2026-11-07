import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  datosAccion,
  datosActividad,
  datosCreacion,
  datosObjetivo,
  datosResultado,
  filtrosGestion,
  motivo,
  tipoGestion,
  version,
} from './gestion.js';
import { contextoGestion, GestionService } from './gestion.service.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import type { Sesion } from '../../common/sesion.js';
import type { PoolClient } from 'pg';

const id = '00000000-0000-4000-8000-000000000096';
const accion = {
  titulo: 'Talleres de buen trato',
  descripcion: 'Trabajar acuerdos con cada curso',
  persona_responsable_id: id,
  publico_objetivo: 'Primer año',
  evidencia_esperada: 'Asistencia y acuerdos',
};
const actividad = {
  titulo: 'Taller de acuerdos',
  persona_responsable_id: id,
  inicio_programado: '2026-11-06T10:00',
  fin_programado: '2026-11-06T11:00',
};

describe('Plan de Gestión, validación del servidor', () => {
  it('crea un plan solo o la jerarquía completa, sin inventar resultados', () => {
    const plan = { id, nombre: 'Convivencia 2026', anio_academico_id: id };
    expect(datosCreacion(plan).objetivo).toBeNull();
    expect(
      datosCreacion({
        ...plan,
        objetivo: { titulo: 'Mejorar el buen trato', orden: 1 },
        accion,
      }).accion?.valor_indicador,
    ).toBeNull();
    expect(() => datosCreacion({ ...plan, accion })).toThrow(
      BadRequestException,
    );
  });
  it.each([null, [], 3, 'texto'])(
    'rechaza cuerpos ajenos al contrato %s',
    (c) => expect(() => datosAccion(c)).toThrow(BadRequestException),
  );
  it.each([0, -1, 1.5, '2', Infinity])('rechaza orden no válido %s', (orden) =>
    expect(() => datosObjetivo({ titulo: 'Objetivo', orden })).toThrow(
      BadRequestException,
    ),
  );
  it('exige responsable, público y respaldo de la acción', () => {
    for (const campo of [
      'persona_responsable_id',
      'publico_objetivo',
      'evidencia_esperada',
    ])
      expect(() => datosAccion({ ...accion, [campo]: '' })).toThrow(
        BadRequestException,
      );
  });
  it('distingue cero alcanzado de ausencia de resultado', () => {
    expect(
      datosAccion({
        ...accion,
        nombre_indicador: 'Talleres',
        unidad_indicador: 'talleres',
        meta_indicador: 5,
        valor_indicador: 0,
      }).valor_indicador,
    ).toBe(0);
    expect(datosAccion(accion).valor_indicador).toBeNull();
    expect(() => datosAccion({ ...accion, meta_indicador: 5 })).toThrow(
      BadRequestException,
    );
    expect(() => datosAccion({ ...accion, valor_indicador: NaN })).toThrow(
      BadRequestException,
    );
  });
  it.each([
    '2026-02-30T10:00',
    '2026-11-06T24:00',
    '2026-11-06T10:60',
    '2026-11-06T10:00Z',
  ])('rechaza fecha local inválida %s', (inicio_programado) =>
    expect(() => datosActividad({ ...actividad, inicio_programado })).toThrow(
      BadRequestException,
    ),
  );
  it('rechaza término anterior al inicio', () =>
    expect(() =>
      datosActividad({ ...actividad, fin_programado: '2026-11-06T09:00' }),
    ).toThrow(BadRequestException));
  it('completar exige resultado y fechas reales coherentes', () => {
    expect(() => datosResultado({ estado: 'COMPLETADO' }, true)).toThrow(
      BadRequestException,
    );
    expect(() =>
      datosResultado(
        {
          estado: 'COMPLETADO',
          resumen_resultado: 'Se realizó el taller',
          completado_en: '2026-11-05T11:00',
          inicio_real: '2026-11-05T11:00',
          fin_real: '2026-11-05T10:00',
        },
        true,
      ),
    ).toThrow(BadRequestException);
    expect(
      datosResultado({ estado: 'EN_PROGRESO' }, false).completado_en,
    ).toBeNull();
  });
  it('no acepta SQL como sección, versiones inválidas ni motivos vacíos', () => {
    expect(() => tipoGestion('planes; DROP TABLE')).toThrow(
      BadRequestException,
    );
    expect(() => version({ version: id })).toThrow(BadRequestException);
    expect(() => motivo({ motivo: ' ' })).toThrow(BadRequestException);
  });
  it('pagina y limita la búsqueda antes de llegar a la base', () => {
    expect(
      filtrosGestion({ pagina: '2', q: ' acuerdos ', anio: '2026' }),
    ).toEqual({ pagina: 2, buscar: 'acuerdos', anio: 2026 });
    for (const pagina of ['1.5', '0', '-1', '100001'])
      expect(() => filtrosGestion({ pagina })).toThrow(BadRequestException);
    expect(() => filtrosGestion({ q: 'a'.repeat(121) })).toThrow(
      BadRequestException,
    );
    expect(() => filtrosGestion({ plan_id: 'otra escuela' })).toThrow(
      BadRequestException,
    );
  });
});

describe('Plan de Gestión, coordinación y autorización', () => {
  it('la creación guiada usa una operación autorizada y nunca reescribe un reintento', async () => {
    const query = vi.fn((sql: string) =>
      Promise.resolve({
        rows: sql.includes('SELECT id,creado_por')
          ? [{ id, creado_por: id }]
          : [],
        rowCount: 0,
      }),
    );
    const operar = vi.fn(
      (_s: unknown, _a: unknown, trabajo: (db: unknown) => unknown) =>
        trabajo({ query }),
    );
    const servicio = new GestionService({ operar } as unknown as CuentaService);
    await expect(
      servicio.crear({ membresia_id: id } as Sesion, {
        id,
        nombre: 'Plan',
        anio_academico_id: id,
      }),
    ).resolves.toEqual({ id });
    expect(operar.mock.calls[0][1]).toEqual({
      tipo: 'establecimiento',
      perfiles: ['CONVIVENCIA'],
    });
    expect(query.mock.calls.some(([sql]) => /INSERT|UPDATE/.test(sql))).toBe(
      false,
    );
  });
  it('bloquea el plan antes que el hijo y vuelve a comprobar su estado', async () => {
    let consultas = 0;
    const query = vi.fn((sql: string) => {
      if (sql.startsWith('SELECT id FROM'))
        return Promise.resolve({ rows: [] });
      consultas++;
      return Promise.resolve({
        rows: [
          {
            registro: { id },
            version: 'a'.repeat(32),
            plan_id: id,
            plan_estado: consultas === 1 ? 'ACTIVO' : 'ARCHIVADO',
          },
        ],
      });
    });
    await expect(
      contextoGestion(
        { query } as unknown as PoolClient,
        'actividades',
        id,
        true,
      ),
    ).rejects.toThrow(ConflictException);
    expect(query.mock.calls[1][0]).toContain(
      'planes_gestion WHERE id=$1 FOR UPDATE',
    );
  });
});
