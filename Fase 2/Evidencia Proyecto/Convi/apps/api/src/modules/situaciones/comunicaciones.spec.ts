import { BadRequestException } from '@nestjs/common';
import {
  LARGO_MAXIMO_RESUMEN_COMUNICACION,
  validarComunicacion,
} from './comunicaciones.js';

// PB-067 (HU-058): las reglas viven en el servidor (HU-119). Estas pruebas
// envían datos que la pantalla nunca mandaría. Lo que depende de la base
// (caso abierto, persona del caso, fecha no futura y la advertencia del
// apoderado) lo revisa el servicio y la base vuelve a exigirlo.
const ID = '2b0f8a52-5d8e-4c2a-9f43-6f1e2d3c4b5a';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
const base = {
  tipo: 'LLAMADA',
  persona_destinataria_id: ID,
  resumen: ' Se acordó una reunión ',
  ocurrido_en: '2026-10-30T15:20',
};

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

describe('Registro de comunicaciones (PB-067, HU-058)', () => {
  it('exige tipo, destinatario, resumen y fecha en que ocurrió (CA1)', () => {
    expect(
      Object.keys(errores(() => validarComunicacion({}, undefined))).sort(),
    ).toEqual(['ocurrido_en', 'persona_destinataria_id', 'resumen', 'tipo']);
  });

  it('acepta una persona del caso y limpia los textos', () => {
    expect(
      validarComunicacion(
        { ...base, persona_destinataria_id: ID.toUpperCase() },
        undefined,
      ),
    ).toEqual({
      tipo: 'LLAMADA',
      persona_destinataria_id: ID,
      destinatario_externo: null,
      resumen: 'Se acordó una reunión',
      ocurrido_en: '2026-10-30T15:20',
      respaldo: null,
    });
  });

  it('acepta un destinatario externo, pero no los dos a la vez', () => {
    expect(
      validarComunicacion(
        {
          ...base,
          persona_destinataria_id: '',
          destinatario_externo: ' OPD Temuco ',
        },
        undefined,
      ),
    ).toMatchObject({
      persona_destinataria_id: null,
      destinatario_externo: 'OPD Temuco',
    });
    expect(
      errores(() =>
        validarComunicacion(
          { ...base, destinatario_externo: 'OPD' },
          undefined,
        ),
      ),
    ).toHaveProperty('destinatario_externo');
  });

  it('el correo no se registra aquí: se prepara con HU-076 (CA4)', () => {
    expect(
      errores(() =>
        validarComunicacion({ ...base, tipo: 'CORREO' }, undefined),
      ),
    ).toHaveProperty('tipo');
  });

  it('revisa el largo del resumen y la fecha', () => {
    expect(
      errores(() =>
        validarComunicacion(
          {
            ...base,
            resumen: 'x'.repeat(LARGO_MAXIMO_RESUMEN_COMUNICACION + 1),
          },
          undefined,
        ),
      ),
    ).toHaveProperty('resumen');
    expect(
      errores(() =>
        validarComunicacion(
          { ...base, ocurrido_en: '2026-02-30T10:00' },
          undefined,
        ),
      ),
    ).toHaveProperty('ocurrido_en');
  });

  it('el respaldo es opcional y se revisa como una evidencia (CA2)', () => {
    expect(
      validarComunicacion(base, {
        originalname: 'respaldo.pdf',
        size: PDF.length,
        buffer: PDF,
      }).respaldo,
    ).toMatchObject({ formato: 'pdf', nombre: 'respaldo.pdf' });
    expect(
      errores(() =>
        validarComunicacion(base, {
          originalname: 'respaldo.exe',
          size: 3,
          buffer: Buffer.from('MZx'),
        }),
      ),
    ).toHaveProperty('archivo');
  });
});
