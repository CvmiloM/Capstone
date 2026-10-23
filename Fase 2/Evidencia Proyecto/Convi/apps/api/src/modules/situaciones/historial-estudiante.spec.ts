import { BadRequestException } from '@nestjs/common';
import {
  aplicarFiltro,
  contarHistorial,
  ordenarHistorial,
  validarFiltroHistorial,
  type RegistroOrdenable,
} from './historial-estudiante.js';

// PB-074 (HU-064 CA1 y CA3): filtros y orden del historial del estudiante.
// Las consultas a la base y el permiso por escuela (CA4) se prueban contra la
// base local.

/** Campos con error del filtro, o null si lo acepta. */
function camposConError(consulta: Record<string, unknown>): string[] | null {
  try {
    validarFiltroHistorial(consulta);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const respuesta = (error as BadRequestException).getResponse() as {
      errores: Record<string, string>;
    };
    return Object.keys(respuesta.errores).sort();
  }
}

function registro(
  tipo: 'SITUACION' | 'CASO',
  codigo: string,
  estado: string,
  hecho: string,
  registro = hecho,
): RegistroOrdenable {
  return {
    tipo,
    codigo,
    estado,
    fecha_dia: hecho.slice(0, 10),
    fecha_hecho: new Date(hecho),
    fecha_registro: new Date(registro),
  };
}

describe('Filtros del historial (PB-074, HU-064 CA3)', () => {
  it('sin filtros trae todo, del más reciente al más antiguo', () => {
    expect(validarFiltroHistorial({})).toEqual({
      tipo: null,
      estado: null,
      desde: null,
      hasta: null,
      orden: 'desc',
    });
  });

  it('acepta un tipo solo o un tipo con su estado', () => {
    expect(validarFiltroHistorial({ estado: 'CASO' })).toMatchObject({
      tipo: 'CASO',
      estado: null,
    });
    expect(
      validarFiltroHistorial({ estado: 'SITUACION:ANTECEDENTE' }),
    ).toMatchObject({ tipo: 'SITUACION', estado: 'ANTECEDENTE' });
    expect(validarFiltroHistorial({ estado: 'CASO:CERRADO' })).toMatchObject({
      tipo: 'CASO',
      estado: 'CERRADO',
    });
  });

  it('rechaza estados que no son de ese tipo o que no existen', () => {
    expect(camposConError({ estado: 'CASO:ANTECEDENTE' })).toEqual(['estado']);
    expect(camposConError({ estado: 'SITUACION:CERRADO' })).toEqual(['estado']);
    expect(camposConError({ estado: 'ANTECEDENTE' })).toEqual(['estado']);
    expect(camposConError({ estado: 'CASO:CERRADO:X' })).toEqual(['estado']);
  });

  it('ignora un estado repetido en la dirección, como si no viniera', () => {
    expect(
      validarFiltroHistorial({ estado: ['CASO', 'SITUACION'] }).tipo,
    ).toBeNull();
  });

  it('acepta un período con días reales y ambos extremos iguales', () => {
    expect(
      validarFiltroHistorial({ desde: '2025-03-01', hasta: '2025-03-01' }),
    ).toMatchObject({ desde: '2025-03-01', hasta: '2025-03-01' });
  });

  it('rechaza días que no existen y un período al revés', () => {
    expect(camposConError({ desde: '2025-02-30' })).toEqual(['desde']);
    expect(camposConError({ hasta: '01-03-2025' })).toEqual(['hasta']);
    expect(
      camposConError({ desde: '2025-06-01', hasta: '2025-05-31' }),
    ).toEqual(['hasta']);
  });

  it('el orden es desc o asc', () => {
    expect(validarFiltroHistorial({ orden: 'asc' }).orden).toBe('asc');
    expect(camposConError({ orden: 'fecha' })).toEqual(['orden']);
  });

  it('muestra todos los errores a la vez', () => {
    expect(camposConError({ estado: 'X', desde: 'ayer', orden: 'z' })).toEqual([
      'desde',
      'estado',
      'orden',
    ]);
  });
});

describe('Orden y totales del historial (PB-074, HU-064 CA1)', () => {
  const registros = [
    registro(
      'SITUACION',
      'SIT-2025-00002',
      'ANTECEDENTE',
      '2025-05-10T14:00:00Z',
    ),
    registro('CASO', 'CASO-2025-00001', 'CERRADO', '2025-05-12T03:00:00Z'),
    registro(
      'SITUACION',
      'SIT-2024-00009',
      'DESCARTADA',
      '2024-11-02T13:00:00Z',
    ),
    registro(
      'SITUACION',
      'SIT-2025-00001',
      'VINCULADA_CASO',
      '2025-05-10T14:00:00Z',
      '2025-05-09T10:00:00Z',
    ),
  ];

  it('ordena por la fecha del hecho y desempata por la de registro', () => {
    expect(ordenarHistorial(registros, 'desc').map((r) => r.codigo)).toEqual([
      'CASO-2025-00001',
      'SIT-2025-00002',
      'SIT-2025-00001',
      'SIT-2024-00009',
    ]);
    expect(ordenarHistorial(registros, 'asc').map((r) => r.codigo)).toEqual([
      'SIT-2024-00009',
      'SIT-2025-00001',
      'SIT-2025-00002',
      'CASO-2025-00001',
    ]);
  });

  it('no cambia la lista original', () => {
    const antes = registros.map((r) => r.codigo);
    ordenarHistorial(registros, 'asc');
    expect(registros.map((r) => r.codigo)).toEqual(antes);
  });

  it('filtra por tipo, estado y período con los días de la escuela', () => {
    const filtro = (consulta: Record<string, unknown>) =>
      aplicarFiltro(registros, validarFiltroHistorial(consulta)).map(
        (r) => r.codigo,
      );
    expect(filtro({ estado: 'CASO' })).toEqual(['CASO-2025-00001']);
    expect(filtro({ estado: 'SITUACION:ANTECEDENTE' })).toEqual([
      'SIT-2025-00002',
    ]);
    expect(filtro({ desde: '2025-01-01' })).toHaveLength(3);
    expect(filtro({ hasta: '2025-05-10' }).sort()).toEqual([
      'SIT-2024-00009',
      'SIT-2025-00001',
      'SIT-2025-00002',
    ]);
    expect(filtro({ desde: '2026-01-01' })).toEqual([]);
  });

  it('cuenta por tipo y estado sin filtros', () => {
    expect(contarHistorial(registros)).toEqual(
      expect.arrayContaining([
        { tipo: 'SITUACION', estado: 'ANTECEDENTE', total: 1 },
        { tipo: 'CASO', estado: 'CERRADO', total: 1 },
        { tipo: 'SITUACION', estado: 'DESCARTADA', total: 1 },
        { tipo: 'SITUACION', estado: 'VINCULADA_CASO', total: 1 },
      ]),
    );
    expect(contarHistorial([])).toEqual([]);
  });
});