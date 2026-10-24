import { BadRequestException } from '@nestjs/common';
import { validarRegla } from './regla.js';

// PB-089 (HU-078 CA1 a CA5 y CA7): validación de una regla de aviso. Los
// estados, las versiones y la base se prueban contra la base local.

const CATEGORIA = '3f2b8c1e-5d4a-4b6f-9e7d-1a2b3c4d5e6f';

const recurrencia = {
  nombre: '  Tres   situaciones en un mes ',
  tipo_regla: 'RECURRENCIA',
  codigo_ambito: 'ESTUDIANTE',
  codigo_operador: 'GE',
  valor_umbral: '3',
  ventana_dias: '30',
  categoria_id: CATEGORIA,
  codigo_accion: 'ALERTA_Y_NOTIFICACION',
  codigo_prioridad: 'ALTA',
};

/** Campos con error, o null si la regla se acepta. */
function camposConError(cuerpo: Record<string, unknown>): string[] | null {
  try {
    validarRegla(cuerpo);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const respuesta = (error as BadRequestException).getResponse() as {
      errores: Record<string, string>;
    };
    return Object.keys(respuesta.errores).sort();
  }
}

describe('validarRegla', () => {
  it('CA1 y CA3: una regla de recurrencia completa', () => {
    expect(validarRegla(recurrencia)).toEqual({
      nombre: 'Tres situaciones en un mes',
      tipo_regla: 'RECURRENCIA',
      codigo_metrica: 'CONTEO_SITUACIONES',
      codigo_operador: 'GE',
      valor_umbral: 3,
      ventana_dias: 30,
      ventana_comparacion_dias: null,
      categoria_id: CATEGORIA,
      codigo_ambito: 'ESTUDIANTE',
      codigo_accion: 'ALERTA_Y_NOTIFICACION',
      codigo_prioridad: 'ALTA',
      vigente_desde: null,
      vigente_hasta: null,
    });
  });

  it('CA3: la recurrencia exige operador, cantidad entera positiva y ventana', () => {
    expect(
      camposConError({
        ...recurrencia,
        codigo_operador: '',
        valor_umbral: '',
        ventana_dias: '',
      }),
    ).toEqual(['codigo_operador', 'valor_umbral', 'ventana_dias']);
    for (const valor_umbral of ['0', '-1', '2.5', 'tres'])
      expect(camposConError({ ...recurrencia, valor_umbral })).toEqual([
        'valor_umbral',
      ]);
    for (const ventana_dias of ['0', '1.5', '4000'])
      expect(camposConError({ ...recurrencia, ventana_dias })).toEqual([
        'ventana_dias',
      ]);
  });

  it('CA2: el ámbito, la acción y la prioridad solo aceptan los valores del modelo', () => {
    expect(camposConError({ ...recurrencia, codigo_ambito: 'CASO' })).toEqual([
      'codigo_ambito',
    ]);
    expect(
      camposConError({ ...recurrencia, codigo_ambito: 'PROFESOR' }),
    ).toEqual(['codigo_ambito']);
    expect(camposConError({ ...recurrencia, codigo_accion: 'CORREO' })).toEqual(
      ['codigo_accion'],
    );
    expect(
      camposConError({ ...recurrencia, codigo_prioridad: 'URGENTE' }),
    ).toEqual(['codigo_prioridad']);
    expect(camposConError({ ...recurrencia, codigo_operador: 'NE' })).toEqual([
      'codigo_operador',
    ]);
  });

  it('CA3: las reglas de vencimientos son por caso, sin categoría ni ventana', () => {
    for (const tipo_regla of ['FECHA_LIMITE', 'PLAZO_PROTOCOLO']) {
      const regla = validarRegla({
        ...recurrencia,
        tipo_regla,
        codigo_ambito: '',
        categoria_id: '',
        valor_umbral: '0',
      });
      expect(regla).toMatchObject({
        tipo_regla,
        codigo_metrica: 'CONTEO_VENCIDOS',
        codigo_ambito: 'CASO',
        valor_umbral: 0,
        ventana_dias: null,
        categoria_id: null,
      });
      expect(camposConError({ ...recurrencia, tipo_regla })).toEqual([
        'categoria_id',
        'codigo_ambito',
      ]);
    }
  });

  it('CA4: la variación compara dos períodos iguales con un porcentaje', () => {
    const variacion = validarRegla({
      ...recurrencia,
      tipo_regla: 'VARIACION_PERIODO',
      codigo_ambito: 'CURSO',
      codigo_operador: 'GT',
      valor_umbral: '50,5',
      ventana_dias: '30',
    });
    expect(variacion).toMatchObject({
      codigo_metrica: 'VARIACION_PORCENTUAL',
      valor_umbral: 50.5,
      ventana_dias: 30,
      ventana_comparacion_dias: 30,
    });
    expect(
      validarRegla({
        ...recurrencia,
        tipo_regla: 'VARIACION_PERIODO',
        codigo_operador: 'LE',
        valor_umbral: '-20',
      }).valor_umbral,
    ).toBe(-20);
    expect(
      camposConError({
        ...recurrencia,
        tipo_regla: 'VARIACION_PERIODO',
        codigo_operador: 'EQ',
      }),
    ).toEqual(['codigo_operador']);
    expect(
      camposConError({
        ...recurrencia,
        tipo_regla: 'VARIACION_PERIODO',
        valor_umbral: '-150',
      }),
    ).toEqual(['valor_umbral']);
  });

  it('CA7: una regla de tipo Otro se guarda sin cálculo', () => {
    expect(
      validarRegla({
        nombre: 'Por definir',
        tipo_regla: 'OTRO',
        codigo_ambito: 'CASO',
        codigo_accion: 'ALERTA',
        codigo_prioridad: 'BAJA',
      }),
    ).toMatchObject({
      tipo_regla: 'OTRO',
      codigo_metrica: null,
      codigo_operador: null,
      valor_umbral: null,
      ventana_dias: null,
    });
  });

  it('CA1: la vigencia es opcional y el término no va antes del inicio', () => {
    expect(
      validarRegla({
        ...recurrencia,
        vigente_desde: '2026-03-01',
        vigente_hasta: '2026-12-31',
      }),
    ).toMatchObject({
      vigente_desde: '2026-03-01',
      vigente_hasta: '2026-12-31',
    });
    expect(
      camposConError({ ...recurrencia, vigente_desde: '2026-02-30' }),
    ).toEqual(['vigente_desde']);
    expect(
      camposConError({
        ...recurrencia,
        vigente_desde: '2026-05-01',
        vigente_hasta: '2026-04-30',
      }),
    ).toEqual(['vigente_hasta']);
  });

  it('pide el nombre y el tipo, y una categoría con formato válido', () => {
    expect(camposConError({ ...recurrencia, nombre: '  ' })).toEqual([
      'nombre',
    ]);
    expect(camposConError({ ...recurrencia, nombre: 'x'.repeat(181) })).toEqual(
      ['nombre'],
    );
    expect(
      camposConError({ ...recurrencia, categoria_id: 'agresion' }),
    ).toEqual(['categoria_id']);
    expect(camposConError({ ...recurrencia, tipo_regla: 'MAGICA' })).toContain(
      'tipo_regla',
    );
    expect(camposConError({})).toEqual([
      'codigo_accion',
      'codigo_ambito',
      'codigo_prioridad',
      'nombre',
      'tipo_regla',
    ]);
  });

  it('acepta números además de texto', () => {
    expect(
      validarRegla({ ...recurrencia, valor_umbral: 4, ventana_dias: 14 }),
    ).toMatchObject({
      valor_umbral: 4,
      ventana_dias: 14,
    });
  });
});
