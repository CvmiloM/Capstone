import type { PoolClient } from 'pg';
import type { AmbitoConteo } from './motor.js';

// PB-090 a PB-092 (HU-079): consultas que comparten las reglas que se evalúan
// al guardar una situación y las que se evalúan una vez al día. Corren con la
// identidad técnica del motor, que solo ve la escuela de la transacción.

/** El registro de cada ámbito en las situaciones, con $1 = registro del ámbito. */
const DEL_AMBITO: Record<AmbitoConteo, string> = {
  ESTUDIANTE: `EXISTS (
      SELECT 1 FROM convi.participaciones p
      JOIN convi.estudiantes e ON e.persona_id = p.persona_id
      WHERE p.situacion_id = s.id AND e.id = $1)`,
  // Cuenta para un curso si ocurrió en ese curso o si participa un estudiante
  // que ese día estaba matriculado en él, como en la búsqueda de expedientes.
  CURSO: `(s.curso_contexto_id = $1 OR EXISTS (
      SELECT 1 FROM convi.participaciones p
      JOIN convi.matriculas m ON m.id = p.matricula_contexto_id
      WHERE p.situacion_id = s.id AND m.curso_id = $1))`,
  ESTABLECIMIENTO: `$1::uuid IS NULL`,
};

/**
 * HU-079 CA6: las situaciones que cuentan para una regla, sin las
 * descartadas (decisión del PO). $1 = registro del ámbito, $2 = categoría de
 * la regla o null para todas, $3 y $4 = primer y último día, en la zona
 * horaria de la escuela.
 */
export function situacionesQueCuentan(ambito: AmbitoConteo): string {
  return `s.estado <> 'DESCARTADA'
         AND ($2::uuid IS NULL OR s.categoria_id = $2)
         AND s.ocurrido_en >= $3::date::timestamptz
         AND s.ocurrido_en < ($4::date + 1)::timestamptz
         AND ${DEL_AMBITO[ambito]}`;
}

/** La columna de la alerta que apunta al registro de cada ámbito (CA2). */
export const COLUMNA_AMBITO: Record<AmbitoConteo | 'CASO', string | null> = {
  ESTUDIANTE: 'estudiante_id',
  CURSO: 'curso_id',
  CASO: 'caso_id',
  ESTABLECIMIENTO: null,
};

export type ReglaDeAlerta = {
  id: string;
  codigo_accion: 'ALERTA' | 'ALERTA_Y_NOTIFICACION';
};

/**
 * Guarda una alerta, sus situaciones de origen y, con «registrar y avisar»,
 * un aviso para cada cuenta activa de Convivencia (CA3 y CA7). Devuelve null
 * si ya existía una alerta con la misma clave, o la cantidad de avisos creados.
 */
export async function guardarAlerta(
  db: PoolClient,
  datos: {
    regla: ReglaDeAlerta;
    ambito: AmbitoConteo | 'CASO';
    registroId: string | null;
    explicacion: object;
    clave: string;
    aviso: { titulo: string; cuerpo: string };
    /** Las situaciones que la originaron, si la regla cuenta situaciones. */
    situaciones?: { categoriaId: string | null; desde: string; hasta: string };
  },
): Promise<number | null> {
  const { regla, ambito, registroId } = datos;
  const alerta = await db.query<{ id: string }>(
    `INSERT INTO convi.alertas
       (establecimiento_id, regla_id, estudiante_id, curso_id, caso_id,
        datos_explicacion, clave_evento)
     VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5, $6)
     ON CONFLICT (establecimiento_id, clave_evento) DO NOTHING
     RETURNING id`,
    [
      regla.id,
      ambito === 'ESTUDIANTE' ? registroId : null,
      ambito === 'CURSO' ? registroId : null,
      ambito === 'CASO' ? registroId : null,
      JSON.stringify(datos.explicacion),
      datos.clave,
    ],
  );
  const alertaId = alerta.rows[0]?.id;
  if (!alertaId) return null;

  if (datos.situaciones && ambito !== 'CASO')
    await db.query(
      `INSERT INTO convi.situaciones_alerta
         (establecimiento_id, alerta_id, situacion_id)
       SELECT convi.establecimiento_actual(), $5, s.id
       FROM convi.situaciones s
       WHERE ${situacionesQueCuentan(ambito)}`,
      [
        registroId,
        datos.situaciones.categoriaId,
        datos.situaciones.desde,
        datos.situaciones.hasta,
        alertaId,
      ],
    );

  // CA7: el aviso se ve en la bandeja de avisos (PB-094).
  if (regla.codigo_accion !== 'ALERTA_Y_NOTIFICACION') return 0;
  const avisos = await db.query(
    `INSERT INTO convi.notificaciones
       (establecimiento_id, membresia_destinatario_id, tipo_notificacion,
        titulo, cuerpo, tipo_recurso, recurso_id, clave_evento)
     SELECT convi.establecimiento_actual(), m.id, 'ALERTA_GENERADA',
            $1, $2, 'alertas', $3, $4
     FROM convi.membresias_establecimiento m
     WHERE m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO'
     ON CONFLICT (membresia_destinatario_id, clave_evento)
       WHERE clave_evento IS NOT NULL DO NOTHING`,
    [datos.aviso.titulo, datos.aviso.cuerpo, alertaId, datos.clave],
  );
  return avisos.rowCount ?? 0;
}

/** HU-079 CA5: cada ejecución queda registrada solo con cantidades. */
export async function registrarEjecucion(
  db: PoolClient,
  recurso: { tipo: 'situaciones' | 'establecimientos'; id: string },
  metadatos: object,
) {
  await db.query(
    `INSERT INTO convi.eventos_auditoria
       (establecimiento_id, codigo_accion, tipo_recurso, recurso_id,
        codigo_resultado, metadatos)
     VALUES (convi.establecimiento_actual(), 'EVALUACION_REGLAS', $1, $2,
             'OK', $3)`,
    [recurso.tipo, recurso.id, JSON.stringify(metadatos)],
  );
}
