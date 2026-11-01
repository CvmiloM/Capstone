// PB-040 (HU-033): las ocho cifras del resumen de la escuela. Solo cuenta
// registros de configuración: no lee situaciones, casos ni alertas (HU-123).

export type ResumenEscuela = {
  /** Momento en que se calcularon las cifras (CA2). */
  calculado_en: Date;
  /** CA5: cuentas en estado Activo, de todos los perfiles. */
  cuentas_activas: number;
  /** CA3: cuentas registradas sin las revocadas, y cuántas están activas. */
  profesores: { registrados: number; activos: number };
  convivencia: { registrados: number; activos: number };
  /** CA2: del año activo más reciente; null si la escuela no tiene uno. */
  anio_activo: { anio: number; cursos: number; matriculas: number } | null;
  /** CA3 y CA5: pares apoderado y estudiante sin repetir, con acceso vigente. */
  accesos_apoderado: number;
  /** CA5: versiones publicadas dentro de su vigencia. */
  protocolos_vigentes: number;
  /** CA3 y CA5: reglas guardadas en estado Activo, no alertas generadas. */
  reglas_activas: number;
};

export type FilaResumen = {
  calculado_en: Date;
  cuentas_activas: number;
  profesores: number;
  profesores_activos: number;
  convivencia: number;
  convivencia_activos: number;
  anio: number | null;
  cursos: number;
  matriculas: number;
  accesos_apoderado: number;
  protocolos_vigentes: number;
  reglas_activas: number;
};

// Una sola consulta: cada viaje a la base cuesta en Azure. La seguridad por
// fila deja solo la escuela de la sesión, y current_date es el día de la
// escuela. El acceso de apoderado vigente es la misma regla del portal del
// apoderado (puede_ver_estudiante): acceso Activo, otorgado y no vencido, y
// vínculo vigente.
export const CONSULTA_RESUMEN = `
  WITH anio AS (
    SELECT a.id, a.anio FROM convi.anios_academicos a
    WHERE a.estado = 'ACTIVO' ORDER BY a.anio DESC LIMIT 1
  ), cuentas AS (
    SELECT count(*) FILTER (WHERE m.estado = 'ACTIVO')::int AS cuentas_activas,
      count(*) FILTER (WHERE m.codigo_perfil = 'PROFESOR' AND m.estado <> 'REVOCADO')::int AS profesores,
      count(*) FILTER (WHERE m.codigo_perfil = 'PROFESOR' AND m.estado = 'ACTIVO')::int AS profesores_activos,
      count(*) FILTER (WHERE m.codigo_perfil = 'CONVIVENCIA' AND m.estado <> 'REVOCADO')::int AS convivencia,
      count(*) FILTER (WHERE m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO')::int AS convivencia_activos
    FROM convi.membresias_establecimiento m
  )
  SELECT now() AS calculado_en, c.*,
    (SELECT anio FROM anio)::int AS anio,
    (SELECT count(*) FROM convi.cursos cu
      WHERE cu.anio_academico_id = (SELECT id FROM anio))::int AS cursos,
    (SELECT count(*) FROM convi.matriculas mt
      WHERE mt.anio_academico_id = (SELECT id FROM anio) AND mt.estado = 'ACTIVO')::int AS matriculas,
    (SELECT count(*) FROM (
      SELECT DISTINCT x.membresia_apoderado_id, ae.estudiante_id
      FROM convi.accesos_apoderado x
      JOIN convi.apoderados_estudiante ae ON ae.id = x.apoderado_estudiante_id
      WHERE x.estado = 'ACTIVO' AND x.otorgado_en <= now() AND x.expira_en > now()
        AND (ae.activo_desde IS NULL OR ae.activo_desde <= current_date)
        AND (ae.activo_hasta IS NULL OR ae.activo_hasta >= current_date)
    ) pares)::int AS accesos_apoderado,
    (SELECT count(*) FROM convi.versiones_protocolo v
      WHERE v.estado = 'PUBLICADO'
        AND (v.vigente_desde IS NULL OR v.vigente_desde <= current_date)
        AND (v.vigente_hasta IS NULL OR v.vigente_hasta >= current_date))::int AS protocolos_vigentes,
    (SELECT count(*) FROM convi.reglas r WHERE r.estado = 'ACTIVO')::int AS reglas_activas
  FROM cuentas c`;

/** CA2: sin año activo no se inventa uno: cursos y matrículas quedan sin cifra. */
export function armarResumen(fila: FilaResumen): ResumenEscuela {
  return {
    calculado_en: fila.calculado_en,
    cuentas_activas: fila.cuentas_activas,
    profesores: {
      registrados: fila.profesores,
      activos: fila.profesores_activos,
    },
    convivencia: {
      registrados: fila.convivencia,
      activos: fila.convivencia_activos,
    },
    anio_activo:
      fila.anio === null
        ? null
        : { anio: fila.anio, cursos: fila.cursos, matriculas: fila.matriculas },
    accesos_apoderado: fila.accesos_apoderado,
    protocolos_vigentes: fila.protocolos_vigentes,
    reglas_activas: fila.reglas_activas,
  };
}
