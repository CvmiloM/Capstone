import { armarResumen, CONSULTA_RESUMEN, type FilaResumen } from './resumen.js';

// PB-040 (HU-033): forma del resumen y alcance de la consulta. Las cifras
// mismas se probaron contra la base local.
const FILA: FilaResumen = {
  calculado_en: new Date('2026-11-01T13:00:00Z'),
  cuentas_activas: 48,
  profesores: 39,
  profesores_activos: 38,
  convivencia: 6,
  convivencia_activos: 5,
  anio: 2026,
  cursos: 24,
  matriculas: 842,
  accesos_apoderado: 791,
  protocolos_vigentes: 8,
  reglas_activas: 14,
};

describe('Resumen de la escuela (PB-040, HU-033)', () => {
  it('distingue registros de cuentas activas (CA3)', () => {
    expect(armarResumen(FILA)).toMatchObject({
      cuentas_activas: 48,
      profesores: { registrados: 39, activos: 38 },
      convivencia: { registrados: 6, activos: 5 },
      anio_activo: { anio: 2026, cursos: 24, matriculas: 842 },
    });
  });

  it('sin año activo no inventa uno (CA2)', () => {
    expect(
      armarResumen({ ...FILA, anio: null, cursos: 0, matriculas: 0 })
        .anio_activo,
    ).toBeNull();
  });

  it('no consulta expedientes de convivencia (CA1, HU-123)', () => {
    for (const tabla of [
      'situaciones',
      'casos',
      'alertas',
      'participaciones',
      'evidencias',
    ])
      expect(CONSULTA_RESUMEN).not.toMatch(new RegExp(`convi\\.${tabla}\\b`));
  });
});
