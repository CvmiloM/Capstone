import { BadRequestException } from '@nestjs/common';
import type { CuentaService } from '../../database/cuenta.service.js';
import type { Sesion } from '../../common/sesion.js';
import {
  armarAnalitica,
  type FilaAnalitica,
  TRAMOS_DURACION,
  validarFiltrosAnalitica,
} from './analitica.js';
import { AnaliticaService } from './analitica.service.js';

// Analítica de Convivencia: filtros, armado de los gráficos y la consulta con
// la cuenta de Convivencia.

const fila = (cambios: Partial<FilaAnalitica> = {}): FilaAnalitica => ({
  calculado_en: '2026-11-12T15:00:00Z',
  zona_horaria: 'America/Santiago',
  hoy: '2026-11-12',
  total_situaciones: 9,
  por_mes: [
    { mes: '2025-11', total: 2 },
    { mes: '2025-12', total: 0 },
    { mes: '2026-01', total: 3 },
    { mes: '2026-11', total: 4 },
  ],
  categorias_por_anio: [
    { anio: 2025, nombre: 'Agresión verbal', total: 2 },
    { anio: 2026, nombre: 'Agresión verbal', total: 1 },
    { anio: 2026, nombre: 'Ciberacoso', total: 6 },
  ],
  duracion: [
    { tramo: 0, cerrados: 3, abiertos: 1 },
    { tramo: 4, cerrados: 1, abiertos: 2 },
  ],
  resumen_casos: {
    cerrados: 4,
    abiertos: 3,
    mediana_cerrados: 12,
    promedio_cerrados: '95.5',
    abierto_mas_antiguo: 420,
  },
  casos_por_anio: [{ anio: 2026, abiertos: 7, cerrados: 4 }],
  categorias: [],
  ...cambios,
});

describe('Filtros de la analítica', () => {
  it('sin categoría mira todas', () => {
    expect(validarFiltrosAnalitica({})).toEqual({ categoria: null });
    expect(validarFiltrosAnalitica({ categoria: '' })).toEqual({
      categoria: null,
    });
  });

  it.each(['otra', 5, ['8d7bcf7f-4258-4603-b309-3c8cef0ff48d']])(
    'rechaza la categoría %s',
    (categoria) => {
      expect(() => validarFiltrosAnalitica({ categoria })).toThrow(
        BadRequestException,
      );
    },
  );
});

describe('Armado de la analítica', () => {
  it('cada año trae sus 12 meses y los meses que no llegan quedan vacíos', () => {
    const datos = armarAnalitica(fila());
    expect(datos.anios.map((a) => a.anio)).toEqual([2025, 2026]);
    const [anterior, actual] = datos.anios;
    expect(anterior.meses).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0]);
    expect(anterior.total).toBe(2);
    expect(actual.meses.slice(0, 2)).toEqual([3, 0]);
    expect(actual.meses[10]).toBe(4);
    expect(actual.meses[11]).toBeNull();
    expect(actual.total).toBe(7);
  });

  it('ordena las categorías de la más recurrente a la menos, con su serie por año', () => {
    const datos = armarAnalitica(fila());
    expect(datos.categorias).toEqual([
      { nombre: 'Ciberacoso', total: 6, por_anio: [0, 6] },
      { nombre: 'Agresión verbal', total: 3, por_anio: [2, 1] },
    ]);
  });

  it('entrega los cinco tramos de duración aunque falten y pasa los decimales a número', () => {
    const datos = armarAnalitica(fila());
    expect(datos.duracion).toHaveLength(TRAMOS_DURACION.length);
    expect(datos.duracion[0]).toEqual({
      nombre: 'Menos de 1 mes',
      cerrados: 3,
      abiertos: 1,
    });
    expect(datos.duracion[2]).toEqual({
      nombre: '3 a 6 meses',
      cerrados: 0,
      abiertos: 0,
    });
    expect(datos.duracion[4]).toEqual({
      nombre: 'Más de 1 año',
      cerrados: 1,
      abiertos: 2,
    });
    expect(datos.resumen_casos.promedio_cerrados).toBe(95.5);
  });

  it('sin situaciones no inventa años', () => {
    const datos = armarAnalitica(
      fila({
        por_mes: [{ mes: '2026-11', total: 0 }],
        categorias_por_anio: [],
        total_situaciones: 0,
      }),
    );
    expect(datos.anios).toEqual([
      { anio: 2026, meses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null], total: 0 },
    ]);
    expect(datos.categorias).toEqual([]);
  });
});

describe('Consulta de la analítica', () => {
  it('usa la cuenta de Convivencia y pasa solo la categoría a la consulta', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [fila()] });
    const operar = vi.fn((_sesion, acceso, trabajo) => {
      expect(acceso).toEqual({
        tipo: 'establecimiento',
        perfiles: ['CONVIVENCIA'],
      });
      return trabajo({ query });
    });
    const servicio = new AnaliticaService({
      operar,
    } as unknown as CuentaService);
    const id = '8d7bcf7f-4258-4603-b309-3c8cef0ff48d';
    const datos = await servicio.consultar({} as Sesion, { categoria: id });
    expect(query.mock.calls[0][1]).toEqual([id]);
    expect(datos.total_situaciones).toBe(9);
  });
});
