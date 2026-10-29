import { BadRequestException } from '@nestjs/common';
import {
  esDia,
  LARGO_MAXIMO_OBJETIVO_PLAN,
  validarAvanceAccion,
  validarCambioEstadoPlan,
  validarCorreccionAccion,
  validarNuevaAccion,
  validarNuevoPlan,
} from './plan-intervencion.js';

// PB-061 y PB-062 (HU-054): las reglas viven en el servidor (HU-119). Estas
// pruebas envían datos que la pantalla nunca mandaría. Lo que depende de la
// base (plan vigente, fechas futuras, motivos y auditoría) se prueba en
// supabase/tests/plan_intervencion.sql.
const ID = '2b0f8a52-5d8e-4c2a-9f43-6f1e2d3c4b5a';
const VERSION = 'a'.repeat(32);

function errores(prueba: () => unknown): Record<string, string> {
  try {
    prueba();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const cuerpo = (error as BadRequestException).getResponse() as {
      errores: Record<string, string>;
    };
    return cuerpo.errores;
  }
  throw new Error('Se esperaba un rechazo');
}

describe('Plan de intervención (PB-061, HU-054)', () => {
  it('exige el objetivo y el estado inicial (CA1)', () => {
    expect(Object.keys(errores(() => validarNuevoPlan({})))).toEqual([
      'objetivo',
      'estado',
    ]);
    expect(
      errores(() =>
        validarNuevoPlan({ objetivo: '   ', estado: 'COMPLETADO' }),
      ),
    ).toHaveProperty('estado');
  });

  it('acepta Borrador o Activo y el protocolo aplicado opcional (CA1)', () => {
    expect(
      validarNuevoPlan({
        objetivo: ' Mejorar la convivencia ',
        estado: 'BORRADOR',
      }),
    ).toEqual({
      objetivo: 'Mejorar la convivencia',
      estado: 'BORRADOR',
      protocolo_caso_id: null,
    });
    expect(
      validarNuevoPlan({
        objetivo: 'Objetivo',
        estado: 'ACTIVO',
        protocolo_caso_id: ID.toUpperCase(),
      }).protocolo_caso_id,
    ).toBe(ID);
    expect(
      errores(() =>
        validarNuevoPlan({
          objetivo: 'x',
          estado: 'ACTIVO',
          protocolo_caso_id: 'otro',
        }),
      ),
    ).toHaveProperty('protocolo_caso_id');
  });

  it('limita el largo del objetivo', () => {
    expect(
      errores(() =>
        validarNuevoPlan({
          objetivo: 'x'.repeat(LARGO_MAXIMO_OBJETIVO_PLAN + 1),
          estado: 'BORRADOR',
        }),
      ),
    ).toHaveProperty('objetivo');
  });

  it('exige motivo para completar o cancelar, pero no para activar (CA5)', () => {
    expect(
      validarCambioEstadoPlan({ estado_nuevo: 'ACTIVO', version: VERSION }),
    ).toEqual({ estado_nuevo: 'ACTIVO', motivo: null, version: VERSION });
    for (const estado_nuevo of ['COMPLETADO', 'CANCELADO'])
      expect(
        errores(() =>
          validarCambioEstadoPlan({
            estado_nuevo,
            motivo: ' ',
            version: VERSION,
          }),
        ),
      ).toHaveProperty('motivo');
    expect(
      validarCambioEstadoPlan({
        estado_nuevo: 'CANCELADO',
        motivo: 'La familia se cambió de escuela',
        version: VERSION,
      }).motivo,
    ).toBe('La familia se cambió de escuela');
  });

  it('no vuelve a Borrador y exige la versión que se veía (PB-139)', () => {
    expect(
      errores(() =>
        validarCambioEstadoPlan({ estado_nuevo: 'BORRADOR', version: VERSION }),
      ),
    ).toHaveProperty('estado_nuevo');
    expect(
      errores(() => validarCambioEstadoPlan({ estado_nuevo: 'ACTIVO' })),
    ).toHaveProperty('estado_nuevo');
  });
});

describe('Acciones del plan (PB-062, HU-054)', () => {
  const accion = {
    descripcion: 'Entrevista con la familia',
    persona_responsable_id: ID,
    vence_dia: '2026-11-15',
  };

  it('exige descripción, responsable y fecha de vencimiento (CA2)', () => {
    expect(Object.keys(errores(() => validarNuevaAccion({})))).toEqual([
      'descripcion',
      'persona_responsable_id',
      'vence_dia',
    ]);
    expect(validarNuevaAccion(accion)).toEqual(accion);
  });

  it('solo acepta días reales del calendario', () => {
    expect(esDia('2026-02-28')).toBe(true);
    expect(esDia('2028-02-29')).toBe(true);
    expect(esDia('2026-02-29')).toBe(false);
    expect(esDia('2026-13-01')).toBe(false);
    expect(esDia('15-11-2026')).toBe(false);
    expect(
      errores(() => validarNuevaAccion({ ...accion, vence_dia: '2026-04-31' })),
    ).toHaveProperty('vence_dia');
  });

  it('al completar exige notas y el día de cumplimiento (CA3)', () => {
    expect(
      Object.keys(
        errores(() =>
          validarAvanceAccion({ estado_nuevo: 'COMPLETADO', version: VERSION }),
        ),
      ),
    ).toEqual(['notas', 'completado_dia']);
    expect(
      validarAvanceAccion({
        estado_nuevo: 'COMPLETADO',
        notas: 'Se realizó la entrevista',
        completado_dia: '2026-10-20',
        version: VERSION,
      }),
    ).toEqual({
      estado_nuevo: 'COMPLETADO',
      notas: 'Se realizó la entrevista',
      completado_dia: '2026-10-20',
      motivo: null,
      version: VERSION,
    });
  });

  it('pide motivo para cancelar y no deja elegir Vencida ni Pendiente', () => {
    expect(
      errores(() =>
        validarAvanceAccion({ estado_nuevo: 'CANCELADO', version: VERSION }),
      ),
    ).toHaveProperty('motivo');
    for (const estado_nuevo of ['VENCIDO', 'PENDIENTE'])
      expect(
        errores(() => validarAvanceAccion({ estado_nuevo, version: VERSION })),
      ).toHaveProperty('estado_nuevo');
    // Pasar a En progreso no guarda notas ni fecha aunque lleguen.
    expect(
      validarAvanceAccion({
        estado_nuevo: 'EN_PROGRESO',
        notas: 'x',
        completado_dia: '2026-10-20',
        version: VERSION,
      }),
    ).toMatchObject({ notas: null, completado_dia: null, motivo: null });
  });

  it('corregir exige motivo y, si está completada, notas y día (CA4)', () => {
    expect(
      errores(() =>
        validarCorreccionAccion({ ...accion, version: VERSION }, false),
      ),
    ).toHaveProperty('motivo');
    expect(
      validarCorreccionAccion(
        { ...accion, motivo: 'Se cambió la fecha', version: VERSION },
        false,
      ),
    ).toEqual({
      ...accion,
      notas: null,
      completado_dia: null,
      motivo: 'Se cambió la fecha',
      version: VERSION,
    });
    expect(
      Object.keys(
        errores(() =>
          validarCorreccionAccion(
            { ...accion, motivo: 'Error de tipeo', version: VERSION },
            true,
          ),
        ),
      ),
    ).toEqual(['notas', 'completado_dia']);
  });
});
