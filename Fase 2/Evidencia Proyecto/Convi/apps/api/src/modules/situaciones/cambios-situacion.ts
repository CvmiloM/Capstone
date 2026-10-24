import type { PoolClient } from 'pg';

// PB-142 (HU-121): la situación guarda por separado la fecha del hecho
// (ocurrido_en, la que se indicó) y la del registro (reportado_en, la del
// servidor), y cada cambio de estado, urgencia o responsable queda en
// eventos_auditoria con el antes, el después, quién y el motivo. Aquí se lee
// ese registro para mostrarlo; la base no deja editarlo ni borrarlo.

/** Lo que guardó el trigger de auditoría en cada cambio de la situación. */
export type FilaAuditoriaSituacion = {
  id: string;
  cambiado_en: Date;
  /** null si el cambio se hizo sin una cuenta, como en los datos de prueba. */
  cambiado_por: string | null;
  /** El motivo indicado al cambiar la urgencia o el responsable. */
  motivo: string | null;
  estado_antes: string | null;
  estado_despues: string | null;
  urgencia_antes: string | null;
  urgencia_despues: string | null;
  responsable_antes_id: string | null;
  responsable_despues_id: string | null;
  responsable_antes: string | null;
  responsable_despues: string | null;
  /** Fundamento de la decisión que cambió el estado, si la hubo. */
  fundamento_decision: string | null;
};

export type CampoCambiado = 'estado' | 'urgencia' | 'responsable';

/** Un cambio de la situación, para mostrarlo en su historial. */
export type CambioSituacion = {
  id: string;
  cambiado_en: Date;
  cambiado_por: string | null;
  /** Estado y urgencia van con su código; el responsable, con su nombre. */
  cambios: {
    campo: CampoCambiado;
    antes: string | null;
    despues: string | null;
  }[];
  motivo: string | null;
};

// Cambios de estado que no vienen de una decisión con fundamento.
const MOTIVO_AUTOMATICO: Record<string, string> = {
  'NUEVA>EN_REVISION': 'Se inició la revisión.',
  'INFORMACION_SOLICITADA>EN_REVISION':
    'El profesor respondió las aclaraciones pendientes.',
};

// Un cambio sigue a otro si parte de los valores en que el otro terminó.
function sigueA(
  anterior: FilaAuditoriaSituacion,
  fila: FilaAuditoriaSituacion,
) {
  return (
    anterior.estado_despues === fila.estado_antes &&
    anterior.urgencia_despues === fila.urgencia_antes &&
    anterior.responsable_despues_id === fila.responsable_antes_id
  );
}

/**
 * Los cambios de una misma transacción comparten la hora (now()), como el
 * registro histórico que pasa a En revisión y luego a Antecedente. Entre ellos
 * va primero el que no sigue a otro del grupo, en vez de depender del id.
 */
export function ordenarMismaHora(
  filas: FilaAuditoriaSituacion[],
): FilaAuditoriaSituacion[] {
  const ordenadas: FilaAuditoriaSituacion[] = [];
  let inicio = 0;
  while (inicio < filas.length) {
    const hora = filas[inicio].cambiado_en.getTime();
    let fin = inicio + 1;
    while (fin < filas.length && filas[fin].cambiado_en.getTime() === hora)
      fin++;
    const grupo = filas.slice(inicio, fin);
    while (grupo.length > 0) {
      const primera = grupo.findIndex(
        (fila) => !grupo.some((otra) => otra !== fila && sigueA(otra, fila)),
      );
      ordenadas.push(...grupo.splice(Math.max(primera, 0), 1));
    }
    inicio = fin;
  }
  return ordenadas;
}

/**
 * Deja solo los cambios de estado, urgencia o responsable, en el orden en que
 * ocurrieron. El motivo es el que se indicó al cambiar; si cambió el estado
 * por una decisión, su fundamento.
 */
export function describirCambios(
  filas: FilaAuditoriaSituacion[],
): CambioSituacion[] {
  const resultado: CambioSituacion[] = [];
  for (const fila of ordenarMismaHora(filas)) {
    const cambios: CambioSituacion['cambios'] = [];
    if (fila.estado_antes !== fila.estado_despues)
      cambios.push({
        campo: 'estado',
        antes: fila.estado_antes,
        despues: fila.estado_despues,
      });
    if (fila.urgencia_antes !== fila.urgencia_despues)
      cambios.push({
        campo: 'urgencia',
        antes: fila.urgencia_antes,
        despues: fila.urgencia_despues,
      });
    if (fila.responsable_antes_id !== fila.responsable_despues_id)
      cambios.push({
        campo: 'responsable',
        antes: fila.responsable_antes,
        despues: fila.responsable_despues,
      });
    if (cambios.length === 0) continue;

    const estado = cambios.find((c) => c.campo === 'estado');
    const motivo =
      fila.motivo ??
      (estado
        ? (fila.fundamento_decision ??
          MOTIVO_AUTOMATICO[`${estado.antes}>${estado.despues}`] ??
          null)
        : null);
    resultado.push({
      id: fila.id,
      cambiado_en: fila.cambiado_en,
      cambiado_por: fila.cambiado_por,
      cambios,
      motivo,
    });
  }
  return resultado;
}

/** Historial de cambios de una situación, del más antiguo al más reciente. */
export async function cambiosDeSituacion(
  db: PoolClient,
  situacionId: string,
): Promise<CambioSituacion[]> {
  // La decisión y el cambio de estado que provoca quedan en la misma
  // transacción, así que comparten la hora (now()) y el estado nuevo.
  const filas = await db.query<FilaAuditoriaSituacion>(
    `SELECT e.id, e.ocurrido_en AS cambiado_en,
            pa.nombres || ' ' || pa.apellidos AS cambiado_por,
            e.metadatos->>'motivo' AS motivo,
            e.metadatos->'antes'->>'estado' AS estado_antes,
            e.metadatos->'despues'->>'estado' AS estado_despues,
            e.metadatos->'antes'->>'urgencia' AS urgencia_antes,
            e.metadatos->'despues'->>'urgencia' AS urgencia_despues,
            e.metadatos->'antes'->>'asignado_a_membresia_id' AS responsable_antes_id,
            e.metadatos->'despues'->>'asignado_a_membresia_id' AS responsable_despues_id,
            pra.nombres || ' ' || pra.apellidos AS responsable_antes,
            prd.nombres || ' ' || prd.apellidos AS responsable_despues,
            (SELECT r.fundamento FROM convi.revisiones_convivencia r
             WHERE r.situacion_id = e.recurso_id
               AND r.tipo_revision = 'DECISION'
               AND r.resultado = e.metadatos->'despues'->>'estado'
               AND r.revisado_en = e.ocurrido_en
             ORDER BY r.id LIMIT 1) AS fundamento_decision
     FROM convi.eventos_auditoria e
     LEFT JOIN convi.membresias_establecimiento ma ON ma.id = e.membresia_actor_id
     LEFT JOIN convi.personas pa ON pa.id = ma.persona_id
     LEFT JOIN convi.membresias_establecimiento mra
       ON mra.id = (e.metadatos->'antes'->>'asignado_a_membresia_id')::uuid
     LEFT JOIN convi.personas pra ON pra.id = mra.persona_id
     LEFT JOIN convi.membresias_establecimiento mrd
       ON mrd.id = (e.metadatos->'despues'->>'asignado_a_membresia_id')::uuid
     LEFT JOIN convi.personas prd ON prd.id = mrd.persona_id
     WHERE e.tipo_recurso = 'situaciones' AND e.recurso_id = $1
       AND e.codigo_accion = 'MODIFICACION'
     ORDER BY e.ocurrido_en, e.id`,
    [situacionId],
  );
  return describirCambios(filas.rows);
}
