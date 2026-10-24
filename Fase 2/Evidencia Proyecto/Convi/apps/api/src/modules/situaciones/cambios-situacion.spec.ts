import {
  describirCambios,
  type FilaAuditoriaSituacion,
} from './cambios-situacion.js';

// PB-142 (HU-121): el historial de cambios de la situación muestra qué cambió,
// quién y por qué. La lectura de eventos_auditoria y las reglas de la base se
// prueban en supabase/tests/fechas_y_cambios.sql.

function fila(
  cambios: Partial<FilaAuditoriaSituacion>,
): FilaAuditoriaSituacion {
  return {
    id: 'e1',
    cambiado_en: new Date('2026-10-20T15:00:00Z'),
    cambiado_por: 'Carla Convivencia',
    motivo: null,
    estado_antes: 'EN_REVISION',
    estado_despues: 'EN_REVISION',
    urgencia_antes: 'NORMAL',
    urgencia_despues: 'NORMAL',
    responsable_antes_id: null,
    responsable_despues_id: null,
    responsable_antes: null,
    responsable_despues: null,
    fundamento_decision: null,
    ...cambios,
  };
}

describe('describirCambios', () => {
  it('deja fuera los eventos que no cambian estado, urgencia ni responsable', () => {
    expect(describirCambios([fila({})])).toEqual([]);
  });

  it('muestra la urgencia anterior y la nueva con el motivo indicado', () => {
    const [cambio] = describirCambios([
      fila({
        urgencia_despues: 'URGENTE',
        motivo: 'Informaron una lesión',
      }),
    ]);
    expect(cambio.cambios).toEqual([
      { campo: 'urgencia', antes: 'NORMAL', despues: 'URGENTE' },
    ]);
    expect(cambio.motivo).toBe('Informaron una lesión');
    expect(cambio.cambiado_por).toBe('Carla Convivencia');
  });

  it('muestra el responsable por su nombre, también la primera asignación', () => {
    const [cambio] = describirCambios([
      fila({
        responsable_despues_id: 'm2',
        responsable_despues: 'Carla Convivencia',
        motivo: 'Primera asignación del responsable de la revisión.',
      }),
    ]);
    expect(cambio.cambios).toEqual([
      { campo: 'responsable', antes: null, despues: 'Carla Convivencia' },
    ]);
  });

  it('usa el fundamento de la decisión como motivo del cambio de estado', () => {
    const [cambio] = describirCambios([
      fila({
        estado_despues: 'DESCARTADA',
        fundamento_decision: 'Duplicado de SIT-2026-00001',
      }),
    ]);
    expect(cambio.cambios).toEqual([
      { campo: 'estado', antes: 'EN_REVISION', despues: 'DESCARTADA' },
    ]);
    expect(cambio.motivo).toBe('Duplicado de SIT-2026-00001');
  });

  it('explica los cambios de estado automáticos y deja los demás sin motivo', () => {
    const cambios = describirCambios([
      fila({ id: 'a', estado_antes: 'NUEVA' }),
      fila({ id: 'b', estado_antes: 'INFORMACION_SOLICITADA' }),
      fila({ id: 'c', estado_antes: 'NUEVA', estado_despues: 'ANTECEDENTE' }),
    ]);
    expect(cambios.map((c) => c.motivo)).toEqual([
      'Se inició la revisión.',
      'El profesor respondió las aclaraciones pendientes.',
      null,
    ]);
  });

  it('ordena los cambios de una misma transacción uno tras otro', () => {
    // Registro histórico: pasa a En revisión y a Antecedente a la misma hora.
    const cambios = describirCambios([
      fila({
        id: 'b',
        estado_antes: 'EN_REVISION',
        estado_despues: 'ANTECEDENTE',
        fundamento_decision: 'Conclusión del registro histórico',
      }),
      fila({ id: 'a', estado_antes: 'NUEVA' }),
    ]);
    expect(cambios.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('conserva el orden y deja sin autor el cambio hecho sin una cuenta', () => {
    const cambios = describirCambios([
      fila({ id: 'a', estado_antes: 'NUEVA', cambiado_por: null }),
      fila({
        id: 'b',
        cambiado_en: new Date('2026-10-20T16:00:00Z'),
        urgencia_despues: 'INMEDIATA',
        motivo: 'x',
      }),
    ]);
    expect(cambios.map((c) => c.id)).toEqual(['a', 'b']);
    expect(cambios[0].cambiado_por).toBeNull();
  });
});
