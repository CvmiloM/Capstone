import { BadRequestException } from '@nestjs/common';
import { validarCambioUrgencia } from './cambio-urgencia.js';
import { validarPregunta } from './nueva-aclaracion.js';
import {
  validarNuevaSituacion,
  validarSituacionConvivencia,
} from './nueva-situacion.js';
import { validarRespuesta } from './respuesta-aclaracion.js';
import { validarCambioResponsable } from './responsable-revision.js';
import { validarRevisionNormativa } from './revision-normativa.js';

// PB-140 (HU-119 CA1): las reglas viven en el servidor. Estas pruebas envían
// directamente a las validaciones datos que la pantalla nunca mandaría, para
// comprobar que se rechazan igual. Las reglas de la base están en
// supabase/tests/situaciones_reglas.sql.

const CURSO = '11111111-1111-4111-8111-111111111111';
const ESTUDIANTE_1 = '22222222-2222-4222-8222-222222222222';
const ESTUDIANTE_2 = '33333333-3333-4333-8333-333333333333';

/** Campos con error que devuelve la validación, o null si acepta los datos. */
function camposConError(validar: () => unknown): string[] | null {
  try {
    validar();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const respuesta = (error as BadRequestException).getResponse() as {
      errores: Record<string, string>;
    };
    return Object.keys(respuesta.errores).sort();
  }
}

describe('Registro del profesor (PB-042, HU-035)', () => {
  const base = {
    curso_id: CURSO,
    ocurrido_en: '2026-10-12T10:30',
    descripcion: '  Discusión en el patio ',
    participantes: [{ estudiante_id: ESTUDIANTE_1, rol: 'AFECTADO' }],
  };

  it('acepta una situación completa, limpia los textos y deja la urgencia Normal', () => {
    expect(validarNuevaSituacion(base)).toEqual({
      curso_id: CURSO,
      ocurrido_en: '2026-10-12T10:30',
      lugar: null,
      urgencia: 'NORMAL',
      categoria_id: null,
      descripcion: 'Discusión en el patio',
      participantes: [{ estudiante_id: ESTUDIANTE_1, rol: 'AFECTADO' }],
    });
  });

  it('indica todos los campos obligatorios que faltan (CA2 y CA5)', () => {
    expect(camposConError(() => validarNuevaSituacion({}))).toEqual([
      'curso_id',
      'descripcion',
      'ocurrido_en',
      'participantes',
    ]);
    expect(camposConError(() => validarNuevaSituacion('texto'))).toEqual([
      'curso_id',
      'descripcion',
      'ocurrido_en',
      'participantes',
    ]);
  });

  it.each([
    [
      'una fecha que no existe',
      { ocurrido_en: '2026-02-30T10:00' },
      'ocurrido_en',
    ],
    [
      'una hora que no existe',
      { ocurrido_en: '2026-10-12T25:00' },
      'ocurrido_en',
    ],
    ['una urgencia inventada', { urgencia: 'ALTA' }, 'urgencia'],
    ['un lugar demasiado largo', { lugar: 'x'.repeat(121) }, 'lugar'],
    [
      'una descripción solo con espacios',
      { descripcion: '   ' },
      'descripcion',
    ],
    [
      'un curso que no es un identificador',
      { curso_id: 'curso-1' },
      'curso_id',
    ],
    [
      'un rol que no existe',
      { participantes: [{ estudiante_id: ESTUDIANTE_1, rol: 'AGRESOR' }] },
      'participantes',
    ],
    [
      'el mismo estudiante dos veces',
      {
        participantes: [
          { estudiante_id: ESTUDIANTE_1, rol: 'AFECTADO' },
          { estudiante_id: ESTUDIANTE_1, rol: 'TESTIGO' },
        ],
      },
      'participantes',
    ],
    ['ningún estudiante', { participantes: [] }, 'participantes'],
  ])('rechaza %s', (_caso, cambio, campo) => {
    expect(
      camposConError(() => validarNuevaSituacion({ ...base, ...cambio })),
    ).toEqual([campo]);
  });

  it('acepta varios estudiantes con roles distintos', () => {
    const datos = validarNuevaSituacion({
      ...base,
      urgencia: 'URGENTE',
      participantes: [
        { estudiante_id: ESTUDIANTE_1, rol: 'AFECTADO' },
        { estudiante_id: ESTUDIANTE_2, rol: 'TESTIGO' },
      ],
    });
    expect(datos.urgencia).toBe('URGENTE');
    expect(datos.participantes).toHaveLength(2);
  });
});

describe('Registro de Convivencia por otros canales (PB-043, HU-036)', () => {
  const base = {
    tipo_origen: 'APODERADO',
    ocurrido_en: '2026-10-12T10:30',
    descripcion: 'Lo informó un apoderado por teléfono.',
    participantes: [{ estudiante_id: ESTUDIANTE_1, rol: 'AFECTADO' }],
  };

  it('acepta una situación sin curso y con informante (CA1)', () => {
    const datos = validarSituacionConvivencia({
      ...base,
      informante_persona_id: ESTUDIANTE_2.toUpperCase(),
    });
    expect(datos.curso_id).toBeNull();
    expect(datos.tipo_origen).toBe('APODERADO');
    expect(datos.informante_persona_id).toBe(ESTUDIANTE_2);
  });

  it('exige el origen y lo mismo que el registro del profesor (CA3)', () => {
    expect(camposConError(() => validarSituacionConvivencia({}))).toEqual([
      'descripcion',
      'ocurrido_en',
      'participantes',
      'tipo_origen',
    ]);
  });

  it('no acepta el origen Profesor: ese registro tiene su propia ruta', () => {
    expect(
      camposConError(() =>
        validarSituacionConvivencia({ ...base, tipo_origen: 'PROFESOR' }),
      ),
    ).toEqual(['tipo_origen']);
  });

  it('no acepta un informante cuando el origen es Otro', () => {
    expect(
      camposConError(() =>
        validarSituacionConvivencia({
          ...base,
          tipo_origen: 'OTRO',
          informante_persona_id: ESTUDIANTE_2,
        }),
      ),
    ).toEqual(['informante_persona_id']);
  });
});

describe('Cambio de urgencia (PB-044, HU-037 CA3)', () => {
  it('exige motivo y una urgencia distinta de la que se veía', () => {
    expect(
      camposConError(() =>
        validarCambioUrgencia({
          urgencia: 'URGENTE',
          urgencia_anterior: 'URGENTE',
          motivo: '  ',
        }),
      ),
    ).toEqual(['motivo', 'urgencia']);
  });

  it('exige la urgencia que se veía, para rechazar cambios desactualizados (PB-139)', () => {
    expect(
      camposConError(() =>
        validarCambioUrgencia({ urgencia: 'INMEDIATA', motivo: 'Lesión' }),
      ),
    ).toEqual(['urgencia']);
  });

  it('acepta un cambio con motivo', () => {
    expect(
      validarCambioUrgencia({
        urgencia: 'INMEDIATA',
        urgencia_anterior: 'NORMAL',
        motivo: ' El apoderado informó una lesión. ',
      }),
    ).toEqual({
      urgencia: 'INMEDIATA',
      urgencia_anterior: 'NORMAL',
      motivo: 'El apoderado informó una lesión.',
    });
  });
});

describe('Responsable de revisión (PB-046, HU-039)', () => {
  const RESPONSABLE_1 = '44444444-4444-4444-8444-444444444444';
  const RESPONSABLE_2 = '55555555-5555-4555-8555-555555555555';

  it('acepta la primera asignación sin motivo', () => {
    expect(
      validarCambioResponsable({
        responsable_id: RESPONSABLE_1,
        responsable_anterior_id: null,
      }),
    ).toEqual({
      responsable_id: RESPONSABLE_1,
      responsable_anterior_id: null,
      motivo: null,
    });
  });

  it('exige motivo para cambiar a un responsable ya asignado (CA3)', () => {
    expect(
      camposConError(() =>
        validarCambioResponsable({
          responsable_id: RESPONSABLE_2,
          responsable_anterior_id: RESPONSABLE_1,
          motivo: ' ',
        }),
      ),
    ).toEqual(['motivo']);
    expect(
      validarCambioResponsable({
        responsable_id: RESPONSABLE_2,
        responsable_anterior_id: RESPONSABLE_1,
        motivo: ' Licencia médica. ',
      }).motivo,
    ).toBe('Licencia médica.');
  });

  it('exige el responsable que se veía, para no reemplazarlo en silencio (CA2)', () => {
    expect(
      camposConError(() =>
        validarCambioResponsable({ responsable_id: RESPONSABLE_1 }),
      ),
    ).toEqual(['responsable_id']);
  });

  it('rechaza un responsable vacío o igual al actual', () => {
    expect(
      camposConError(() =>
        validarCambioResponsable({
          responsable_id: 'no-es-un-id',
          responsable_anterior_id: '',
        }),
      ),
    ).toEqual(['responsable_id']);
    expect(
      camposConError(() =>
        validarCambioResponsable({
          responsable_id: RESPONSABLE_1,
          responsable_anterior_id: RESPONSABLE_1,
          motivo: 'Sin cambio',
        }),
      ),
    ).toEqual(['responsable_id']);
  });
});

describe('Revisión normativa (PB-155, HU-134)', () => {
  const PROTOCOLO = '66666666-6666-4666-8666-666666666666';
  const DOCUMENTO = '77777777-7777-4777-8777-777777777777';

  it('exige aplicabilidad y fundamento, y deja el modo en manual (CA1 y CA3)', () => {
    expect(
      camposConError(() => validarRevisionNormativa({ fundamento: ' ' })),
    ).toEqual(['aplicabilidad', 'fundamento']);
    expect(
      validarRevisionNormativa({
        aplicabilidad: 'POR_CONFIRMAR',
        fundamento: ' El RICE no lo menciona. ',
      }),
    ).toEqual({
      aplicabilidad: 'POR_CONFIRMAR',
      modo_revision: 'MANUAL',
      fundamento: 'El RICE no lo menciona.',
      version_protocolo_id: null,
      referencias: [],
    });
  });

  it('acepta protocolo y páginas consultadas (CA1 y CA2)', () => {
    const revision = validarRevisionNormativa({
      aplicabilidad: 'APLICABLE',
      modo_revision: 'ASISTIDA_IA',
      fundamento: 'Aplica el protocolo de agresiones.',
      version_protocolo_id: PROTOCOLO,
      referencias: [
        {
          version_documento_id: DOCUMENTO,
          pagina_desde: '12',
          pagina_hasta: '13',
        },
        { version_documento_id: DOCUMENTO, titulo_seccion: ' Título IV ' },
      ],
    });
    expect(revision.modo_revision).toBe('ASISTIDA_IA');
    expect(revision.referencias).toEqual([
      {
        version_documento_id: DOCUMENTO,
        pagina_desde: 12,
        pagina_hasta: 13,
        titulo_seccion: null,
      },
      {
        version_documento_id: DOCUMENTO,
        pagina_desde: null,
        pagina_hasta: null,
        titulo_seccion: 'Título IV',
      },
    ]);
  });

  it('rechaza un protocolo cuando la norma no es aplicable', () => {
    expect(
      camposConError(() =>
        validarRevisionNormativa({
          aplicabilidad: 'NO_APLICABLE',
          fundamento: 'No corresponde.',
          version_protocolo_id: PROTOCOLO,
        }),
      ),
    ).toEqual(['version_protocolo_id']);
  });

  it('rechaza páginas mal indicadas o sin documento (CA2)', () => {
    const base = { aplicabilidad: 'APLICABLE', fundamento: 'Ver RICE.' };
    for (const referencia of [
      { pagina_desde: 3 },
      { version_documento_id: DOCUMENTO },
      { version_documento_id: DOCUMENTO, pagina_desde: 0 },
      { version_documento_id: DOCUMENTO, pagina_desde: 9, pagina_hasta: 4 },
      { version_documento_id: DOCUMENTO, pagina_hasta: 4 },
    ]) {
      expect(
        camposConError(() =>
          validarRevisionNormativa({ ...base, referencias: [referencia] }),
        ),
      ).toEqual(['referencias']);
    }
  });
});

describe('Aclaraciones (PB-045 y PB-049)', () => {
  it('exige la pregunta de Convivencia (HU-038 CA1)', () => {
    expect(camposConError(() => validarPregunta({ pregunta: ' ' }))).toEqual([
      'pregunta',
    ]);
    expect(validarPregunta({ pregunta: ' ¿Quién más estaba? ' })).toBe(
      '¿Quién más estaba?',
    );
  });

  it('exige la respuesta del profesor y limita su largo (HU-042 CA1)', () => {
    expect(camposConError(() => validarRespuesta({}))).toEqual(['respuesta']);
    expect(
      camposConError(() => validarRespuesta({ respuesta: 'x'.repeat(4001) })),
    ).toEqual(['respuesta']);
    expect(validarRespuesta({ respuesta: ' Un inspector. ' })).toBe(
      'Un inspector.',
    );
  });
});
