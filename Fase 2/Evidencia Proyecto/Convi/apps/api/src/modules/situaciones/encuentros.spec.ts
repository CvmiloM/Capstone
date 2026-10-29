import { BadRequestException } from '@nestjs/common';
import {
  fechaHora,
  leerAsistentes,
  MAXIMO_ASISTENTES,
  validarCancelacion,
  validarNuevoEncuentro,
  validarRealizacion,
  validarReprogramacion,
} from './encuentros.js';

// PB-063 y PB-064 (HU-055): las reglas viven en el servidor (HU-119). Estas
// pruebas envían datos que la pantalla nunca mandaría. Lo que depende de la
// base (fechas reales futuras, motivo al reprogramar, auditoría y asistencia)
// se prueba en supabase/tests/encuentros.sql.
const ID = '2b0f8a52-5d8e-4c2a-9f43-6f1e2d3c4b5a';
const OTRO = '7c1e9b40-3a2d-4f8e-8b6a-1d2c3e4f5a6b';
const VERSION = 'b'.repeat(32);

function errores(prueba: () => unknown): Record<string, string> {
  try {
    prueba();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (
      (error as BadRequestException).getResponse() as {
        errores: Record<string, string>;
      }
    ).errores;
  }
  throw new Error('Se esperaba un rechazo');
}

const encuentro = {
  tipo: 'ENTREVISTA',
  objetivo: 'Conversar con la familia',
  responsable_id: ID,
  lugar: 'Oficina de Convivencia',
  programado_en: '2026-11-03T10:00',
  asistentes: [{ persona_id: OTRO, rol: 'APODERADO' }],
};

describe('Programación de encuentros (PB-063, HU-055)', () => {
  it('exige tipo, objetivo, responsable, lugar, fecha y asistentes (CA1 y CA3)', () => {
    expect(Object.keys(errores(() => validarNuevoEncuentro({})))).toEqual([
      'tipo',
      'objetivo',
      'responsable_id',
      'lugar',
      'programado_en',
      'asistentes',
    ]);
  });

  it('no acepta el seguimiento, que es otro ítem (PB-068)', () => {
    expect(
      errores(() =>
        validarNuevoEncuentro({ ...encuentro, tipo: 'SEGUIMIENTO' }),
      ),
    ).toHaveProperty('tipo');
  });

  it('acepta una fecha futura y deja opcionales el término y la acción del plan (CA6)', () => {
    expect(validarNuevoEncuentro(encuentro)).toEqual({
      ...encuentro,
      descripcion: null,
      fin_programado_en: null,
      accion_plan_id: null,
      asistentes: [{ persona_id: OTRO, rol: 'APODERADO' }],
    });
  });

  it('rechaza un término anterior al inicio (CA2)', () => {
    expect(
      errores(() =>
        validarNuevoEncuentro({
          ...encuentro,
          fin_programado_en: '2026-11-03T09:30',
        }),
      ),
    ).toHaveProperty('fin_programado_en');
    expect(
      validarNuevoEncuentro({
        ...encuentro,
        fin_programado_en: '2026-11-03T11:00',
      }).fin_programado_en,
    ).toBe('2026-11-03T11:00');
  });

  it('solo acepta fechas y horas reales', () => {
    expect(fechaHora('2026-11-03T10:00')).toBe('2026-11-03T10:00');
    expect(fechaHora('2026-11-03T10:00:59')).toBe('2026-11-03T10:00');
    expect(fechaHora('2026-02-30T10:00')).toBeNull();
    expect(fechaHora('2026-11-03T24:00')).toBeNull();
    expect(fechaHora('2026-11-03')).toBeNull();
  });

  it('no repite asistentes y rechaza roles o personas que no son de la lista (CA4)', () => {
    expect(
      leerAsistentes([
        { persona_id: OTRO, rol: 'ESTUDIANTE' },
        { persona_id: OTRO.toUpperCase(), rol: 'ESTUDIANTE' },
        { persona_id: OTRO, rol: 'EQUIPO' },
      ]),
    ).toEqual([
      { persona_id: OTRO, rol: 'ESTUDIANTE' },
      { persona_id: OTRO, rol: 'EQUIPO' },
    ]);
    expect(leerAsistentes([{ persona_id: OTRO, rol: 'DIRECTOR' }])).toBe(false);
    expect(leerAsistentes([{ persona_id: 'x', rol: 'EQUIPO' }])).toBe(false);
    expect(
      leerAsistentes(
        Array.from({ length: MAXIMO_ASISTENTES + 1 }, () => ({
          persona_id: OTRO,
          rol: 'EQUIPO',
        })),
      ),
    ).toBe(false);
  });

  it('reprogramar exige la nueva fecha, el motivo y la versión que se veía (CA5)', () => {
    expect(
      Object.keys(errores(() => validarReprogramacion({ version: VERSION }))),
    ).toEqual(['programado_en', 'motivo']);
    expect(
      validarReprogramacion({
        programado_en: '2026-11-05T15:00',
        motivo: 'La familia no puede ese día',
        version: VERSION,
      }),
    ).toEqual({
      programado_en: '2026-11-05T15:00',
      fin_programado_en: null,
      motivo: 'La familia no puede ese día',
      version: VERSION,
    });
  });

  it('cancelar exige motivo', () => {
    expect(
      errores(() => validarCancelacion({ version: VERSION })),
    ).toHaveProperty('motivo');
  });
});

describe('Registro de encuentros realizados (PB-064, HU-055)', () => {
  it('exige inicio real, resultado y la asistencia de cada participante (CA3 y CA4)', () => {
    expect(
      Object.keys(errores(() => validarRealizacion({ version: VERSION }))),
    ).toEqual(['realizado_en', 'resultado', 'asistencia']);
    expect(
      errores(() =>
        validarRealizacion({
          realizado_en: '2026-10-28T10:00',
          resultado: 'Se acordó un plan de trabajo',
          asistencia: [{ participacion_id: ID, estado: 'PENDIENTE' }],
          version: VERSION,
        }),
      ),
    ).toHaveProperty(`asistencia_${ID}`);
  });

  it('acepta el término real opcional, pero no antes del inicio (CA2)', () => {
    const datos = {
      realizado_en: '2026-10-28T10:00',
      resultado: 'Se acordó un plan de trabajo',
      asistencia: [
        { participacion_id: ID, estado: 'ASISTIO' },
        { participacion_id: OTRO, estado: 'JUSTIFICADO' },
      ],
      version: VERSION,
    };
    expect(validarRealizacion(datos)).toEqual({ ...datos, fin_real_en: null });
    expect(
      errores(() =>
        validarRealizacion({ ...datos, fin_real_en: '2026-10-28T09:00' }),
      ),
    ).toHaveProperty('fin_real_en');
  });
});
