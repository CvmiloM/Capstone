import { createHash } from 'node:crypto';
import { FECHA_CORTE } from './calendario.js';
import { esServidorLocal, leerOpciones, servidorDe } from './opciones.js';
import {
  generarPlan,
  MINIMO_SITUACIONES,
  type Fila,
  type Plan,
} from './plan.js';

// PB-159 (HU-137): el plan de datos sintéticos, sin base de datos. La carga y
// las reglas de los triggers se prueban contra la base local.

const huella = (plan: Plan) =>
  createHash('sha256').update(JSON.stringify(plan)).digest('hex');

const porId = (filas: Fila[]) => new Map(filas.map((f) => [String(f.id), f]));

describe('generarPlan', () => {
  // Un plan completo, como el que pide el ensayo de rendimiento.
  const plan = generarPlan({
    semilla: '2026',
    situaciones: MINIMO_SITUACIONES,
  });
  const t = plan.tablas;

  it('CA2: la misma semilla da exactamente los mismos datos', () => {
    const a = generarPlan({ semilla: 'prueba', situaciones: 600 });
    const b = generarPlan({ semilla: 'prueba', situaciones: 600 });
    expect(huella(a)).toBe(huella(b));
    expect(huella(generarPlan({ semilla: 'otra', situaciones: 600 }))).not.toBe(
      huella(a),
    );
  });

  it('CA1: dos escuelas, 10 000 situaciones en tres años y unos 2000 estudiantes activos', () => {
    expect(plan.escuelas).toHaveLength(2);
    expect(t.situaciones).toHaveLength(MINIMO_SITUACIONES);
    expect(Object.keys(plan.resumen.situaciones_por_anio).sort()).toEqual([
      '2024',
      '2025',
      '2026',
    ]);
    for (const cantidad of Object.values(plan.resumen.situaciones_por_anio))
      expect(cantidad).toBeGreaterThan(2000);
    expect(plan.resumen.estudiantes_activos).toBeGreaterThan(1900);
    expect(plan.resumen.estudiantes_activos).toBeLessThan(2200);
    expect(t.casos.length).toBeGreaterThan(500);
  });

  it('CA3: todo queda dentro de las dos escuelas sintéticas', () => {
    const ids = new Set(plan.escuelas.map((e) => e.id));
    for (const e of plan.escuelas)
      expect(e.codigo).toMatch(/^SINTETICA-2026-(NORTE|SUR)$/);
    for (const [tabla, filas] of Object.entries(t))
      if (tabla !== 'establecimientos')
        for (const fila of filas)
          expect(ids.has(String(fila.establecimiento_id))).toBe(true);
    for (const cuenta of plan.cuentas)
      expect(cuenta.correo).toMatch(/\.sintetico\.convi\.test$/);
    expect(
      plan.cuentas.filter((c) => c.conAcceso).map((c) => c.perfil),
    ).toEqual(['CONVIVENCIA', 'CONVIVENCIA']);
  });

  it('cada id y cada código se usa una sola vez', () => {
    const ids = Object.values(t)
      .flat()
      .map((f) => String(f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const tabla of ['situaciones', 'casos'] as const) {
      const codigos = t[tabla].map(
        (f) => `${String(f.establecimiento_id)}:${String(f.codigo)}`,
      );
      expect(new Set(codigos).size).toBe(codigos.length);
      for (const fila of t[tabla])
        expect(String(fila.codigo)).toMatch(/^(SIT|CASO)-20(24|25|26)-\d{5}$/);
    }
  });

  it('las fechas van en orden y nada pasa después de la fecha de corte', () => {
    const corte = `${FECHA_CORTE} 23:59:59`;
    for (const s of t.situaciones) {
      expect(String(s.reportado_en) >= String(s.ocurrido_en)).toBe(true);
      expect(String(s.reportado_en) <= corte).toBe(true);
      expect(String(s.codigo).slice(4, 8)).toBe(
        String(s.reportado_en).slice(0, 4),
      );
    }
    for (const fila of [
      ...t.revisiones_convivencia,
      ...t.historial_estados_caso,
    ])
      expect(String(fila.revisado_en ?? fila.cambiado_en) <= corte).toBe(true);
  });

  it('HU-066: cada participación usa una matrícula del estudiante vigente el día del hecho', () => {
    const matriculas = porId(t.matriculas);
    const estudiantePorPersona = new Map(
      t.estudiantes.map((e) => [String(e.persona_id), String(e.id)]),
    );
    const situaciones = porId(t.situaciones);
    for (const p of t.participaciones) {
      const m = matriculas.get(String(p.matricula_contexto_id));
      expect(m?.estudiante_id).toBe(
        estudiantePorPersona.get(String(p.persona_id)),
      );
      if (p.situacion_id === null) continue;
      const dia = String(
        situaciones.get(String(p.situacion_id))?.ocurrido_en,
      ).slice(0, 10);
      expect(String(m?.matriculado_en) <= dia).toBe(true);
      expect(m?.finalizado_en === null || String(m?.finalizado_en) >= dia).toBe(
        true,
      );
    }
  });

  it('las matrículas de un estudiante no se superponen y hay una sola activa', () => {
    const porEstudiante = new Map<string, Fila[]>();
    for (const m of t.matriculas) {
      const lista = porEstudiante.get(String(m.estudiante_id)) ?? [];
      lista.push(m);
      porEstudiante.set(String(m.estudiante_id), lista);
    }
    for (const lista of porEstudiante.values()) {
      lista.sort((a, b) =>
        String(a.matriculado_en).localeCompare(String(b.matriculado_en)),
      );
      for (let i = 1; i < lista.length; i++)
        expect(
          String(lista[i - 1].finalizado_en) < String(lista[i].matriculado_en),
        ).toBe(true);
      expect(
        lista.filter((m) => m.estado === 'ACTIVO').length,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('el estado de cada situación sale de su última decisión', () => {
    const ultima = new Map<string, Fila>();
    for (const r of t.revisiones_convivencia)
      ultima.set(String(r.situacion_id), r);
    const respondidas = new Set(
      t.aclaraciones_situacion
        .filter((a) => a.estado === 'RESPONDIDA')
        .map((a) => String(a.situacion_id)),
    );
    for (const s of t.situaciones) {
      const r = ultima.get(String(s.id));
      if (!r) expect(['NUEVA', 'EN_REVISION']).toContain(s.estado);
      else if (
        r.resultado === 'INFORMACION_SOLICITADA' &&
        respondidas.has(String(s.id))
      )
        expect(s.estado).toBe('EN_REVISION');
      else expect(s.estado).toBe(r.resultado);
      expect(s.estado === 'VINCULADA_CASO').toBe(s.caso_id !== null);
    }
  });

  it('un caso comparte estudiantes con sus situaciones y sus cambios de estado siguen el flujo', () => {
    const personasCaso = new Map<string, Set<string>>();
    for (const p of t.participaciones)
      if (p.caso_id !== null) {
        const conjunto =
          personasCaso.get(String(p.caso_id)) ?? new Set<string>();
        conjunto.add(String(p.persona_id));
        personasCaso.set(String(p.caso_id), conjunto);
      }
    const personasSituacion = new Map<string, string[]>();
    for (const p of t.participaciones)
      if (p.situacion_id !== null)
        personasSituacion.set(String(p.situacion_id), [
          ...(personasSituacion.get(String(p.situacion_id)) ?? []),
          String(p.persona_id),
        ]);
    for (const s of t.situaciones.filter((x) => x.caso_id !== null)) {
      const delCaso = personasCaso.get(String(s.caso_id)) ?? new Set();
      expect(
        personasSituacion.get(String(s.id))?.some((p) => delCaso.has(p)),
      ).toBe(true);
    }
    const ultimo = new Map<string, string>();
    for (const h of t.historial_estados_caso) {
      expect(h.estado_anterior).toBe(
        ultimo.get(String(h.caso_id)) ?? 'EN_ANALISIS',
      );
      ultimo.set(String(h.caso_id), String(h.estado_nuevo));
    }
    for (const c of t.casos)
      expect(c.estado_actual).toBe(ultimo.get(String(c.id)) ?? 'EN_ANALISIS');
  });

  it('CA4: hay estudiantes que se repiten, casos vencidos y situaciones en todos los estados', () => {
    const veces = new Map<string, number>();
    for (const p of t.participaciones)
      if (p.situacion_id !== null)
        veces.set(
          String(p.persona_id),
          (veces.get(String(p.persona_id)) ?? 0) + 1,
        );
    expect([...veces.values()].filter((n) => n >= 10).length).toBeGreaterThan(
      20,
    );
    expect(
      t.casos.filter(
        (c) =>
          c.estado_actual !== 'CERRADO' &&
          String(c.fecha_limite_cierre) < FECHA_CORTE,
      ).length,
    ).toBeGreaterThan(0);
    for (const estado of [
      'NUEVA',
      'EN_REVISION',
      'INFORMACION_SOLICITADA',
      'ANTECEDENTE',
      'DESCARTADA',
      'VINCULADA_CASO',
    ])
      expect(plan.resumen.situaciones_por_estado[estado]).toBeGreaterThan(0);
    for (const estado of [
      'EN_INTERVENCION',
      'EN_SEGUIMIENTO',
      'CERRADO',
      'REABIERTO',
    ])
      expect(
        t.historial_estados_caso.some((h) => h.estado_nuevo === estado),
      ).toBe(true);
  });

  it('rechaza una semilla o una cantidad inválida', () => {
    expect(() =>
      generarPlan({ semilla: 'con espacio', situaciones: 100 }),
    ).toThrow();
    expect(() =>
      generarPlan({ semilla: 'x'.repeat(21), situaciones: 100 }),
    ).toThrow();
    expect(() => generarPlan({ semilla: 'ok', situaciones: 1.5 })).toThrow();
  });
});

describe('leerOpciones', () => {
  it('usa la semilla 2026 y 10 000 situaciones por defecto', () => {
    expect(leerOpciones([])).toMatchObject({
      semilla: '2026',
      situaciones: 10_000,
      reemplazar: false,
      permitirNube: false,
      claveConvivencia: false,
    });
  });

  it('lee cada opción', () => {
    expect(
      leerOpciones([
        '--semilla',
        'ensayo-1',
        '--situaciones',
        '20000',
        '--reemplazar',
        '--permitir-nube',
        '--clave-convivencia',
      ]),
    ).toEqual({
      ayuda: false,
      semilla: 'ensayo-1',
      situaciones: 20_000,
      reemplazar: true,
      permitirNube: true,
      claveConvivencia: true,
    });
  });

  it('rechaza opciones desconocidas o valores fuera de rango', () => {
    for (const argumentos of [
      ['--otra'],
      ['--semilla'],
      ['--semilla', 'con espacio'],
      ['--situaciones', '50'],
      ['--situaciones', 'mil'],
      ['--semilla', '--reemplazar'],
    ])
      expect(() => leerOpciones(argumentos)).toThrow();
  });
});

describe('esServidorLocal', () => {
  it('reconoce la base local de Docker', () => {
    expect(
      esServidorLocal(
        'postgresql://postgres:x@host.docker.internal:54322/postgres',
      ),
    ).toBe(true);
    expect(esServidorLocal('http://127.0.0.1:54321')).toBe(true);
    expect(esServidorLocal('http://kong:8000')).toBe(true);
  });

  it('trata cualquier otro servidor como la nube', () => {
    expect(
      esServidorLocal(
        'postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres',
      ),
    ).toBe(false);
    expect(esServidorLocal('https://abcdefgh.supabase.co')).toBe(false);
    expect(esServidorLocal('no es una url')).toBe(false);
  });

  it('muestra el servidor sin usuario ni clave', () => {
    expect(
      servidorDe(
        'postgresql://postgres:secreta@host.docker.internal:54322/postgres',
      ),
    ).toBe('host.docker.internal:54322');
  });
});
