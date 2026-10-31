import type { PoolClient } from 'pg';

// PB-094 (HU-081): avisos para el equipo de Convivencia. Cada aviso se crea en
// la misma transacción que lo origina, así que si la operación falla tampoco
// queda el aviso. Solo llegan a cuentas activas de Convivencia de la escuela
// (CA2, la base lo vuelve a exigir), nunca a quien hizo la acción (por
// defecto), y la clave del evento impide repetirlos para la misma persona.
// Los textos usan códigos y no nombres de estudiantes.

export type TipoAviso =
  | 'SITUACION_URGENTE'
  | 'SITUACION_ASIGNADA'
  | 'ACLARACION_RESPONDIDA'
  | 'CASO_ASIGNADO'
  | 'DOCUMENTO_PROCESADO';

export type NuevoAviso = {
  tipo: TipoAviso;
  titulo: string;
  cuerpo: string;
  /** Registro al que lleva el aviso (HU-081 CA3). */
  tipoRecurso: 'situaciones' | 'aclaraciones_situacion' | 'casos';
  recursoId: string;
  /** Una membresía, o EQUIPO para todas las cuentas activas de Convivencia. */
  destinatario: string;
  /** Lo que distingue este evento de otro del mismo tipo. */
  evento: string;
};

export const EQUIPO = 'EQUIPO';

/** Crea el aviso y devuelve cuántas personas lo recibieron. */
export async function crearAvisos(
  db: PoolClient,
  aviso: NuevoAviso,
): Promise<number> {
  const resultado = await db.query(
    `INSERT INTO convi.notificaciones
       (establecimiento_id, membresia_destinatario_id, tipo_notificacion,
        titulo, cuerpo, tipo_recurso, recurso_id, clave_evento)
     SELECT convi.establecimiento_actual(), m.id, $1::text, $2, $3, $4, $5, $1::text || ':' || $6
     FROM convi.membresias_establecimiento m
     WHERE m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO'
       AND m.id IS DISTINCT FROM convi.membresia_actual()
       AND ($7::text = '${EQUIPO}' OR m.id::text = $7)
     ON CONFLICT (membresia_destinatario_id, clave_evento)
       WHERE clave_evento IS NOT NULL DO NOTHING`,
    [
      aviso.tipo,
      aviso.titulo,
      aviso.cuerpo,
      aviso.tipoRecurso,
      aviso.recursoId,
      aviso.evento,
      aviso.destinatario,
    ],
  );
  return resultado.rowCount ?? 0;
}

const NOMBRE_URGENCIA: Record<string, string> = {
  URGENTE: 'urgente',
  INMEDIATA: 'inmediata',
};

/** CA1: solo las situaciones Urgentes o Inmediatas avisan al registrarse. */
export function avisaUrgencia(urgencia: string) {
  return urgencia === 'URGENTE' || urgencia === 'INMEDIATA';
}

export const TEXTO_AVISO = {
  situacionUrgente: (codigo: string, urgencia: string) => ({
    titulo: `Situación ${NOMBRE_URGENCIA[urgencia] ?? 'urgente'} ${codigo}`,
    cuerpo: `Se registró la situación ${codigo} con urgencia ${NOMBRE_URGENCIA[urgencia] ?? 'urgente'}. Revísala en la bandeja.`,
  }),
  situacionAsignada: (codigo: string) => ({
    titulo: `Te asignaron la situación ${codigo}`,
    cuerpo: `Quedaste como responsable de revisar la situación ${codigo}.`,
  }),
  aclaracionRespondida: (codigo: string) => ({
    titulo: `Respondieron tu aclaración de ${codigo}`,
    cuerpo: `El profesor respondió la información que pediste sobre la situación ${codigo}.`,
  }),
  casoAsignado: (codigo: string, alCrear: boolean) => ({
    titulo: `Te asignaron el caso ${codigo}`,
    cuerpo: alCrear
      ? `Se abrió el caso ${codigo} y quedaste como su responsable.`
      : `Te reasignaron el caso ${codigo} y ahora eres su responsable.`,
  }),
};

/**
 * Cuando termina la preparación de una versión para la búsqueda (lista o
 * fallida), avisa a quien la subió si es de Convivencia; si la subió el
 * administrador no hay aviso, porque la ve en sus pantallas (CA5). Aquí sí
 * llega aunque la preparación la haya pedido la misma persona, porque corre
 * en segundo plano. Cada intento de preparación es un evento distinto.
 */
export async function avisarDocumentoProcesado(
  db: PoolClient,
  versionId: string,
  listo: boolean,
): Promise<number> {
  const resultado = await db.query(
    `INSERT INTO convi.notificaciones
       (establecimiento_id, membresia_destinatario_id, tipo_notificacion,
        titulo, cuerpo, tipo_recurso, recurso_id, clave_evento)
     SELECT convi.establecimiento_actual(), m.id, 'DOCUMENTO_PROCESADO',
       CASE WHEN $2 THEN 'Documento listo para consultas'
            ELSE 'No se pudo preparar un documento' END,
       CASE WHEN $2
         THEN 'La versión ' || v.etiqueta_version || ' de «' || d.titulo || '» quedó lista para las consultas con IA.'
         ELSE 'La versión ' || v.etiqueta_version || ' de «' || d.titulo || '» no se pudo preparar para las consultas con IA. El original sigue disponible y puedes volver a intentarlo.' END,
       'versiones_documento', v.id,
       'DOCUMENTO_PROCESADO:' || v.id || ':' || v.intentos_procesamiento
     FROM convi.versiones_documento v
     JOIN convi.documentos_institucionales d ON d.id = v.documento_id
     JOIN convi.membresias_establecimiento m
       ON m.id = v.subido_por AND m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO'
     WHERE v.id = $1
     ON CONFLICT (membresia_destinatario_id, clave_evento)
       WHERE clave_evento IS NOT NULL DO NOTHING`,
    [versionId, listo],
  );
  return resultado.rowCount ?? 0;
}
