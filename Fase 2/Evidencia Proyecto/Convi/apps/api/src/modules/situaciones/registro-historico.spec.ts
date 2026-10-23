import { BadRequestException } from '@nestjs/common';
import {
  LARGO_MAXIMO_CONCLUSION,
  validarRegistroHistorico,
} from './registro-historico.js';

// PB-075 (HU-065): validación del registro histórico. Que quede como
// antecedente, marcado y con la fecha de registro del servidor se prueba
// contra la base local.

const ESTUDIANTE = '22222222-2222-4222-8222-222222222222';

const base = {
  tipo_origen: 'OTRO',
  ocurrido_en: '2019-05-10T10:30',
  descripcion: 'Pelea en el recreo, según el libro de clases de 2019',
  urgencia: 'NORMAL',
  participantes: [{ estudiante_id: ESTUDIANTE, rol: 'AFECTADO' }],
  conclusion: '  Se conversó con las familias y no se repitió. ',
};

/** Campos con error, o null si acepta los datos. */
function camposConError(cuerpo: unknown): string[] | null {
  try {
    validarRegistroHistorico(cuerpo);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const respuesta = (error as BadRequestException).getResponse() as {
      errores: Record<string, string>;
    };
    return Object.keys(respuesta.errores).sort();
  }
}

describe('Registro histórico (PB-075, HU-065)', () => {
  it('acepta una situación antigua con su conclusión, sin espacios de más', () => {
    const datos = validarRegistroHistorico(base);
    expect(datos.conclusion).toBe(
      'Se conversó con las familias y no se repitió.',
    );
    expect(datos.ocurrido_en).toBe('2019-05-10T10:30');
    expect(datos.participantes).toHaveLength(1);
  });

  it('exige la conclusión', () => {
    expect(camposConError({ ...base, conclusion: '   ' })).toEqual([
      'conclusion',
    ]);
    expect(camposConError({ ...base, conclusion: undefined })).toEqual([
      'conclusion',
    ]);
  });

  it('limita el largo de la conclusión', () => {
    expect(
      camposConError({
        ...base,
        conclusion: 'a'.repeat(LARGO_MAXIMO_CONCLUSION + 1),
      }),
    ).toEqual(['conclusion']);
    expect(
      camposConError({
        ...base,
        conclusion: 'a'.repeat(LARGO_MAXIMO_CONCLUSION),
      }),
    ).toBeNull();
  });

  it('valida lo mismo que el registro de Convivencia y muestra todo junto', () => {
    expect(
      camposConError({
        ...base,
        descripcion: '',
        participantes: [],
        conclusion: '',
      }),
    ).toEqual(['conclusion', 'descripcion', 'participantes']);
  });

  it('rechaza un cuerpo que no es un objeto', () => {
    expect(camposConError(null)).toContain('conclusion');
  });
});