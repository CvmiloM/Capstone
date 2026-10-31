import { Inject, Injectable, Logger } from '@nestjs/common';
import { CuentaService } from '../../database/cuenta.service.js';

// PB-094 (HU-081 CA1): cada mañana, después de las reglas diarias, avisa lo
// que vence ese día y sigue abierto, en todas las escuelas activas aunque no
// tengan reglas. Corre con la identidad técnica del motor, que solo ve la
// escuela de cada transacción y sus fechas, estados y responsables.
//
// Por defecto: seguimientos programados, pasos de un protocolo activo,
// compromisos y acciones de un plan activo que vencen hoy, en casos no
// cerrados. Los seguimientos y pasos avisan a su responsable; los compromisos
// y acciones, al responsable del caso; si esa persona ya no es de Convivencia
// activa, al responsable del caso. La clave lleva la fecha: si se cambia la
// fecha, la nueva genera otro aviso, y repetir la evaluación no duplica nada.
// Las actividades del Plan de Gestión quedan para cuando exista el Plan.
const VENCE_HOY = (columna: string) =>
  `${columna} >= current_date::timestamptz AND ${columna} < (current_date + 1)::timestamptz`;

const AVISOS_DEL_DIA = `
  WITH vence AS (
    SELECT 'compromisos' AS tipo, k.id, k.caso_id, NULL::uuid AS responsable, k.vence_en
    FROM convi.compromisos k
    WHERE k.estado IN ('PENDIENTE', 'EN_PROGRESO') AND ${VENCE_HOY('k.vence_en')}
    UNION ALL
    SELECT 'acciones_plan_intervencion', a.id, p.caso_id, NULL, a.vence_en
    FROM convi.acciones_plan_intervencion a
    JOIN convi.planes_intervencion p ON p.id = a.plan_intervencion_id
    WHERE p.estado = 'ACTIVO' AND a.estado IN ('PENDIENTE', 'EN_PROGRESO')
      AND ${VENCE_HOY('a.vence_en')}
    UNION ALL
    SELECT 'actuaciones', t.id, t.caso_id, t.membresia_responsable_id, t.programado_en
    FROM convi.actuaciones t
    WHERE t.tipo_actuacion = 'SEGUIMIENTO' AND t.estado IN ('PLANIFICADA', 'POSPUESTA')
      AND ${VENCE_HOY('t.programado_en')}
    UNION ALL
    SELECT 'estados_pasos_protocolo_caso', ep.id, pc.caso_id, ep.responsable_id, ep.vence_en
    FROM convi.estados_pasos_protocolo_caso ep
    JOIN convi.protocolos_caso pc ON pc.id = ep.protocolo_caso_id
    WHERE pc.estado = 'ACTIVO' AND ep.estado IN ('PENDIENTE', 'EN_PROGRESO')
      AND ${VENCE_HOY('ep.vence_en')}
  ), nombres(tipo, nombre) AS (
    VALUES ('compromisos', 'un compromiso'),
           ('acciones_plan_intervencion', 'una acción del plan de intervención'),
           ('actuaciones', 'un seguimiento'),
           ('estados_pasos_protocolo_caso', 'un paso del protocolo')
  )
  INSERT INTO convi.notificaciones
    (establecimiento_id, membresia_destinatario_id, tipo_notificacion,
     titulo, cuerpo, tipo_recurso, recurso_id, clave_evento)
  SELECT convi.establecimiento_actual(), d.id, 'VENCIMIENTO',
    'Vence hoy ' || n.nombre || ' del caso ' || c.codigo,
    'Hoy vence ' || n.nombre || ' del caso ' || c.codigo || ' y sigue abierto.',
    v.tipo, v.id,
    'VENCIMIENTO:' || v.tipo || ':' || v.id || ':' || to_char(v.vence_en, 'YYYY-MM-DD')
  FROM vence v
  JOIN nombres n ON n.tipo = v.tipo
  JOIN convi.casos c ON c.id = v.caso_id AND c.estado_actual <> 'CERRADO'
  JOIN LATERAL (
    SELECT m.id FROM convi.membresias_establecimiento m
    WHERE m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO'
      AND m.id IN (v.responsable, c.asignado_a_membresia_id)
    ORDER BY (m.id = v.responsable) IS TRUE DESC
    LIMIT 1
  ) d ON true
  ON CONFLICT (membresia_destinatario_id, clave_evento)
    WHERE clave_evento IS NOT NULL DO NOTHING`;

@Injectable()
export class VencimientosService {
  private readonly logger = new Logger(VencimientosService.name);

  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  /**
   * Avisa en todas las escuelas activas. Una escuela que falla no detiene a
   * las demás; al final se lanza el error para que la cola reintente.
   */
  async avisarTodas(): Promise<number> {
    const escuelas = await this.cuentas.escuelasActivas();
    let fallidas = 0;
    let avisos = 0;
    for (const escuela of escuelas) {
      try {
        avisos += (await this.avisarEscuela(escuela)) ?? 0;
      } catch {
        // Sin el detalle del error: puede traer datos de la base.
        fallidas++;
      }
    }
    if (fallidas > 0) {
      this.logger.error(
        `Los avisos de vencimientos fallaron en ${fallidas} de ${escuelas.length} escuelas.`,
      );
      throw new Error(
        'Fallaron los avisos de vencimientos de algunas escuelas.',
      );
    }
    return avisos;
  }

  /** Cuántos avisos creó hoy en la escuela; null si no está activa. */
  avisarEscuela(establecimientoId: string): Promise<number | null> {
    return this.cuentas.operarMotor(establecimientoId, async (db) => {
      const resultado = await db.query(AVISOS_DEL_DIA);
      return resultado.rowCount ?? 0;
    });
  }
}
