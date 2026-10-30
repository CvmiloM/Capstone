import { BadRequestException } from '@nestjs/common';
import {
  validarCompromiso,
  validarSeguimiento,
  validarResultadoSeguimiento,
  validarRevision,
  ESTADOS_COMPROMISO,
} from './seguimientos.js';

const id = '2b0f8a52-5d8e-4c2a-9f43-6f1e2d3c4b5a';
const version = 'a'.repeat(32);
const revision = {
  compromiso_id: id,
  version,
  estado_observado: 'COMPLETADO',
  observacion: 'Se cumplió lo acordado',
};
const seguimiento = {
  objetivo: 'Revisar acuerdos',
  responsable_id: id,
  programado_en: '2026-11-01T10:00',
};
const resultado = {
  realizado_en: '2026-10-30T09:00',
  resultado: 'Se conversó con la familia',
  proxima_accion: 'Mantener el acompañamiento',
  version,
  revisiones: [revision],
};

describe('Compromisos y seguimientos, PB-057, PB-065 y PB-068 a PB-071', () => {
  it('exige descripción, responsable y vencimiento del compromiso', () => {
    expect(() => validarCompromiso({})).toThrow(BadRequestException);
    expect(
      validarCompromiso({
        descripcion: ' Conversar ',
        persona_responsable_id: id,
        vence_en: '2026-11-01T10:00',
      }),
    ).toEqual({
      descripcion: 'Conversar',
      persona_responsable_id: id,
      vence_en: '2026-11-01T10:00',
      actuacion_origen_id: null,
    });
  });
  it('rechaza un origen manipulado', () =>
    expect(() =>
      validarCompromiso({
        descripcion: 'Conversar',
        persona_responsable_id: id,
        vence_en: '2026-11-01T10:00',
        actuacion_origen_id: 'otro',
      }),
    ).toThrow());
  it('exige los datos de programación', () => {
    expect(validarSeguimiento(seguimiento)).toEqual(seguimiento);
    expect(() =>
      validarSeguimiento({ ...seguimiento, responsable_id: null }),
    ).toThrow();
  });
  it.each(['2026-02-30T10:00', '2026-11-01T25:00', '2026-11-01', 'texto'])(
    'rechaza la fecha inválida %s',
    (fecha) =>
      expect(() =>
        validarSeguimiento({ ...seguimiento, programado_en: fecha }),
      ).toThrow(),
  );
  it('guardar sin siguiente no crea una programación implícita', () =>
    expect(validarResultadoSeguimiento(resultado).siguiente).toBeNull());
  it('conserva un siguiente explícito y otro profesional', () =>
    expect(
      validarResultadoSeguimiento({ ...resultado, siguiente: seguimiento })
        .siguiente,
    ).toEqual(seguimiento));
  it('otro seguimiento exige fecha y debe ser posterior al realizado', () => {
    expect(() =>
      validarResultadoSeguimiento({
        ...resultado,
        siguiente: { ...seguimiento, programado_en: '' },
      }),
    ).toThrow();
    expect(() =>
      validarResultadoSeguimiento({
        ...resultado,
        siguiente: { ...seguimiento, programado_en: resultado.realizado_en },
      }),
    ).toThrow();
  });
  it.each(['realizado_en', 'resultado', 'proxima_accion', 'version'])(
    'exige %s para guardar el resultado',
    (campo) =>
      expect(() =>
        validarResultadoSeguimiento({ ...resultado, [campo]: '' }),
      ).toThrow(),
  );
  it('impide revisar dos veces el mismo compromiso en el mismo envío', () =>
    expect(() =>
      validarResultadoSeguimiento({
        ...resultado,
        revisiones: [revision, revision],
      }),
    ).toThrow());
  it.each(ESTADOS_COMPROMISO)(
    'acepta el estado observado %s solo con explicación',
    (estado) => {
      expect(
        validarRevision({ ...revision, estado_observado: estado })
          .estado_observado,
      ).toBe(estado);
      expect(() =>
        validarRevision({
          ...revision,
          estado_observado: estado,
          observacion: ' ',
        }),
      ).toThrow();
    },
  );
  it('rechaza estados desconocidos y huellas ausentes', () => {
    expect(() =>
      validarRevision({ ...revision, estado_observado: 'APROBADO' }),
    ).toThrow();
    expect(() => validarRevision({ ...revision, version: '' })).toThrow();
  });
  it('limita el tamaño del lote de revisión y los textos', () => {
    expect(() =>
      validarResultadoSeguimiento({
        ...resultado,
        revisiones: Array(101).fill(revision),
      }),
    ).toThrow();
    expect(() =>
      validarSeguimiento({ ...seguimiento, objetivo: 'x'.repeat(1001) }),
    ).toThrow();
  });
});
