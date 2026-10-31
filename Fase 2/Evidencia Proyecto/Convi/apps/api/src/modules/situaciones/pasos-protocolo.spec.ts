import { BadRequestException } from '@nestjs/common';
import {
  LARGO_MAXIMO_MOTIVO_PROTOCOLO,
  LARGO_MAXIMO_NOTAS_PASO,
  validarAsignacionPaso,
  validarAvancePaso,
  validarCambioEstadoProtocolo,
} from './pasos-protocolo.js';

// PB-055 (HU-048) y PB-056 (HU-049): las reglas viven en el servidor (HU-119).
// Estas pruebas envían datos que la pantalla nunca mandaría. Lo que depende de
// la base (responsable de Convivencia activa, respaldo, protocolo Activo y
// auditoría) lo revisa el servicio y la base vuelve a exigirlo.
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

describe('Avance de los pasos del protocolo (PB-055, HU-048)', () => {
  it('acepta En progreso, Completado u Omitido; Vencido no se elige (CA1)', () => {
    for (const estado of ['EN_PROGRESO', 'COMPLETADO'] as const)
      expect(
        validarAvancePaso({ estado_nuevo: estado, version: VERSION }),
      ).toEqual({ estado_nuevo: estado, notas: null, version: VERSION });
    for (const estado of ['VENCIDO', 'PENDIENTE', 'otro', undefined])
      expect(
        errores(() =>
          validarAvancePaso({ estado_nuevo: estado, version: VERSION }),
        ),
      ).toHaveProperty('estado_nuevo');
  });

  it('omitir exige la justificación en las notas (CA4)', () => {
    expect(
      errores(() =>
        validarAvancePaso({
          estado_nuevo: 'OMITIDO',
          notas: '   ',
          version: VERSION,
        }),
      ),
    ).toEqual({ notas: 'Explica por qué se omite el paso.' });
    expect(
      validarAvancePaso({
        estado_nuevo: 'OMITIDO',
        notas: ' No aplica a este caso ',
        version: VERSION,
      }),
    ).toEqual({
      estado_nuevo: 'OMITIDO',
      notas: 'No aplica a este caso',
      version: VERSION,
    });
  });

  it('limita el largo de las notas y exige la versión que se veía', () => {
    expect(
      errores(() =>
        validarAvancePaso({
          estado_nuevo: 'COMPLETADO',
          notas: 'x'.repeat(LARGO_MAXIMO_NOTAS_PASO + 1),
          version: VERSION,
        }),
      ),
    ).toHaveProperty('notas');
    expect(
      errores(() =>
        validarAvancePaso({ estado_nuevo: 'COMPLETADO', version: 'vieja' }),
      ),
    ).toHaveProperty('estado_nuevo');
  });

  it('el responsable es obligatorio y el plazo opcional (CA1 y CA2)', () => {
    expect(
      validarAsignacionPaso({
        responsable_id: ID.toUpperCase(),
        vence_dia: '2026-11-15',
        version: VERSION,
      }),
    ).toEqual({
      responsable_id: ID,
      vence_dia: '2026-11-15',
      version: VERSION,
    });
    expect(
      validarAsignacionPaso({
        responsable_id: ID,
        vence_dia: '',
        version: VERSION,
      }),
    ).toEqual({ responsable_id: ID, vence_dia: null, version: VERSION });
    expect(
      Object.keys(
        errores(() =>
          validarAsignacionPaso({
            responsable_id: 'alguien',
            vence_dia: '2026-02-30',
            version: VERSION,
          }),
        ),
      ),
    ).toEqual(['responsable_id', 'vence_dia']);
  });
});

describe('Término del protocolo aplicado (PB-056, HU-049)', () => {
  it('completar, cancelar o reabrir exige motivo (CA1 y CA2)', () => {
    for (const estado of ['COMPLETADO', 'CANCELADO', 'ACTIVO'] as const)
      expect(
        validarCambioEstadoProtocolo({
          estado_nuevo: estado,
          motivo: ' Se cumplió el procedimiento ',
          version: VERSION,
        }),
      ).toEqual({
        estado_nuevo: estado,
        motivo: 'Se cumplió el procedimiento',
        version: VERSION,
      });
    expect(
      errores(() =>
        validarCambioEstadoProtocolo({
          estado_nuevo: 'ACTIVO',
          version: VERSION,
        }),
      ),
    ).toEqual({ motivo: 'Explica por qué se reabre el protocolo.' });
    expect(
      errores(() =>
        validarCambioEstadoProtocolo({
          estado_nuevo: 'CANCELADO',
          motivo: '',
          version: VERSION,
        }),
      ),
    ).toEqual({ motivo: 'Explica por qué termina el protocolo.' });
  });

  it('rechaza otros estados, motivos largos y versiones inválidas', () => {
    expect(
      errores(() =>
        validarCambioEstadoProtocolo({
          estado_nuevo: 'BORRADOR',
          motivo: 'x',
          version: VERSION,
        }),
      ),
    ).toHaveProperty('estado_nuevo');
    expect(
      errores(() =>
        validarCambioEstadoProtocolo({
          estado_nuevo: 'COMPLETADO',
          motivo: 'x'.repeat(LARGO_MAXIMO_MOTIVO_PROTOCOLO + 1),
          version: VERSION,
        }),
      ),
    ).toHaveProperty('motivo');
    expect(
      errores(() =>
        validarCambioEstadoProtocolo({
          estado_nuevo: 'COMPLETADO',
          motivo: 'x',
        }),
      ),
    ).toHaveProperty('estado_nuevo');
  });
});
