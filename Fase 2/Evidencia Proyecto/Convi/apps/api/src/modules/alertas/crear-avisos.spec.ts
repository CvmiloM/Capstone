import {
  avisaUrgencia,
  crearAvisos,
  EQUIPO,
  TEXTO_AVISO,
} from './crear-avisos.js';

// PB-094 (HU-081): qué situaciones avisan y qué dicen los avisos. A quién
// llegan y que no se repitan lo exigen la consulta y la base; esto se probó
// contra la base local.
describe('Avisos para Convivencia (PB-094, HU-081)', () => {
  it('solo las situaciones Urgentes o Inmediatas avisan al registrarse (CA1)', () => {
    expect(avisaUrgencia('URGENTE')).toBe(true);
    expect(avisaUrgencia('INMEDIATA')).toBe(true);
    for (const urgencia of ['NORMAL', '', 'urgente', 'constructor'])
      expect(avisaUrgencia(urgencia)).toBe(false);
  });

  it('cada aviso tiene título y contenido con el código del registro (CA3)', () => {
    const textos = [
      TEXTO_AVISO.situacionUrgente('SIT-2026-00001', 'INMEDIATA'),
      TEXTO_AVISO.situacionAsignada('SIT-2026-00001'),
      TEXTO_AVISO.aclaracionRespondida('SIT-2026-00001'),
      TEXTO_AVISO.casoAsignado('CASO-2026-00001', true),
      TEXTO_AVISO.casoAsignado('CASO-2026-00001', false),
    ];
    for (const { titulo, cuerpo } of textos) {
      expect(titulo).toMatch(/(SIT|CASO)-2026-00001/);
      expect(cuerpo).toMatch(/(SIT|CASO)-2026-00001/);
      // La columna titulo admite hasta 180 caracteres.
      expect(titulo.length).toBeLessThanOrEqual(180);
    }
    expect(TEXTO_AVISO.situacionUrgente('SIT-1', 'INMEDIATA').titulo).toBe(
      'Situación inmediata SIT-1',
    );
    expect(TEXTO_AVISO.casoAsignado('CASO-1', true).cuerpo).not.toBe(
      TEXTO_AVISO.casoAsignado('CASO-1', false).cuerpo,
    );
  });

  it('nunca avisa a quien hizo la acción ni a cuentas que no son de Convivencia activa (CA2)', async () => {
    const consultas: { sql: string; valores: unknown[] }[] = [];
    const db = {
      query: (sql: string, valores: unknown[]) => {
        consultas.push({ sql, valores });
        return Promise.resolve({ rowCount: 2 });
      },
    };
    const avisos = await crearAvisos(db as never, {
      tipo: 'SITUACION_URGENTE',
      titulo: 'T',
      cuerpo: 'C',
      tipoRecurso: 'situaciones',
      recursoId: 'id',
      destinatario: EQUIPO,
      evento: 'id',
    });
    expect(avisos).toBe(2);
    expect(consultas[0].sql).toContain("m.codigo_perfil = 'CONVIVENCIA'");
    expect(consultas[0].sql).toContain("m.estado = 'ACTIVO'");
    expect(consultas[0].sql).toContain(
      'm.id IS DISTINCT FROM convi.membresia_actual()',
    );
    expect(consultas[0].sql).toContain('ON CONFLICT');
  });
});
