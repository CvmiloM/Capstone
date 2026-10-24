import type { Client } from 'pg';
import { TABLAS, VERSION_GENERADOR, type Fila, type Plan } from './plan.js';

// PB-159: escribe el plan en la base dentro de una sola transacción. Para
// cargar una historia de varios años con sus fechas reales (decisión del PO),
// los triggers se apagan solo en esa transacción (session_replication_role
// replica) y al final verificar() comprueba las mismas reglas que ellos.

/** Marca en la auditoría que identifica a una escuela sintética (CA3). */
export const ACCION_GENERACION = 'GENERACION_SINTETICA';

/** Parámetros por consulta, bajo el límite de 65 535 de PostgreSQL. */
const PARAMETROS_POR_CONSULTA = 30_000;

export type RegistroGeneracion = {
  entorno: 'local' | 'nube';
  servidor: string;
  generadoEn: string;
};

async function insertarFilas(db: Client, tabla: string, filas: Fila[]) {
  if (filas.length === 0) return;
  const columnas = Object.keys(filas[0]);
  const porLote = Math.max(
    1,
    Math.floor(PARAMETROS_POR_CONSULTA / columnas.length),
  );
  for (let inicio = 0; inicio < filas.length; inicio += porLote) {
    const lote = filas.slice(inicio, inicio + porLote);
    const valores: unknown[] = [];
    const grupos = lote.map((fila) => {
      const marcas = columnas.map((columna) => {
        valores.push(fila[columna]);
        return `$${valores.length}`;
      });
      return `(${marcas.join(', ')})`;
    });
    await db.query(
      `INSERT INTO convi.${tabla} (${columnas.join(', ')}) VALUES ${grupos.join(', ')}`,
      valores,
    );
  }
}

/**
 * CA2: carga todo y deja en la auditoría de cada escuela la semilla, el
 * tamaño y el entorno. Debe correr dentro de una transacción abierta.
 */
export async function cargarPlan(
  db: Client,
  plan: Plan,
  registro: RegistroGeneracion,
) {
  await db.query(`SET LOCAL session_replication_role = replica`);
  // Las fechas del plan están en la hora local de las escuelas.
  await db.query(`SET LOCAL TIME ZONE 'America/Santiago'`);
  for (const tabla of TABLAS)
    await insertarFilas(db, tabla, plan.tablas[tabla]);
  await insertarFilas(
    db,
    'eventos_auditoria',
    plan.escuelas.map((escuela) => ({
      establecimiento_id: escuela.id,
      membresia_actor_id: null,
      codigo_accion: ACCION_GENERACION,
      tipo_recurso: 'establecimientos',
      recurso_id: escuela.id,
      codigo_resultado: 'OK',
      ocurrido_en: registro.generadoEn,
      metadatos: JSON.stringify({
        semilla: plan.semilla,
        version_generador: VERSION_GENERADOR,
        fecha_corte: plan.fecha_corte,
        entorno: registro.entorno,
        servidor: registro.servidor,
        node: process.version,
        tamano: plan.resumen,
      }),
    })),
  );
  await db.query(`SET LOCAL session_replication_role = origin`);
}

export type EscuelaExistente = {
  id: string;
  codigo: string;
  /** Tiene la marca de generación sintética con esta semilla. */
  marcada: boolean;
};

export async function escuelasExistentes(
  db: Client,
  codigos: string[],
  semilla: string,
): Promise<EscuelaExistente[]> {
  const resultado = await db.query<EscuelaExistente>(
    `SELECT e.id, e.codigo,
            EXISTS (SELECT 1 FROM convi.eventos_auditoria a
                    WHERE a.establecimiento_id = e.id
                      AND a.codigo_accion = $2
                      AND a.metadatos->>'semilla' = $3) AS marcada
     FROM convi.establecimientos e
     WHERE e.codigo = ANY($1::text[])`,
    [codigos, ACCION_GENERACION, semilla],
  );
  return resultado.rows;
}

/** Identidades de Auth que ya usan los correos del plan. */
export async function identidadesExistentes(db: Client, correos: string[]) {
  const resultado = await db.query<{ id: string; email: string }>(
    `SELECT id, email FROM auth.users WHERE lower(email) = ANY($1::text[])`,
    [correos.map((c) => c.toLowerCase())],
  );
  return resultado.rows;
}

/**
 * Borra por completo las escuelas indicadas, que deben ser sintéticas (el
 * llamador lo comprueba con escuelasExistentes). Devuelve las identidades de
 * Auth de sus cuentas, para borrarlas después. Debe correr en una transacción.
 */
export async function borrarEscuelas(
  db: Client,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const identidades = await db.query<{ auth_usuario_id: string }>(
    `SELECT auth_usuario_id FROM convi.membresias_establecimiento
     WHERE establecimiento_id = ANY($1::uuid[]) AND auth_usuario_id IS NOT NULL`,
    [ids],
  );
  const tablas = await db.query<{ table_name: string }>(
    `SELECT c.table_name
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'convi' AND c.column_name = 'establecimiento_id'
       AND t.table_type = 'BASE TABLE'
     ORDER BY c.table_name`,
  );
  await db.query(`SET LOCAL session_replication_role = replica`);
  for (const { table_name } of tablas.rows)
    await db.query(
      `DELETE FROM convi.${table_name} WHERE establecimiento_id = ANY($1::uuid[])`,
      [ids],
    );
  await db.query(
    `DELETE FROM convi.establecimientos WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  await db.query(`SET LOCAL session_replication_role = origin`);
  return identidades.rows.map((f) => f.auth_usuario_id);
}

/**
 * Las mismas reglas que imponen los triggers del modelo, revisadas sobre los
 * datos cargados. Cada consulta cuenta lo que no las cumple; devuelve las
 * reglas que fallan con su cantidad.
 */
const REGLAS: { regla: string; consulta: string }[] = [
  {
    regla: 'Una situación decidida tiene el estado de su última decisión',
    consulta: `SELECT count(*) FROM convi.situaciones s
      JOIN LATERAL (SELECT r.resultado, r.caso_destino_id FROM convi.revisiones_convivencia r
                    WHERE r.situacion_id = s.id ORDER BY r.revisado_en DESC, r.id DESC LIMIT 1) u ON true
      WHERE s.establecimiento_id = ANY($1)
        AND NOT (s.estado = u.resultado OR (u.resultado = 'INFORMACION_SOLICITADA' AND s.estado = 'EN_REVISION'
             AND EXISTS (SELECT 1 FROM convi.aclaraciones_situacion a WHERE a.situacion_id = s.id AND a.estado = 'RESPONDIDA')))`,
  },
  {
    regla: 'Una situación sin decisión está Nueva o En revisión',
    consulta: `SELECT count(*) FROM convi.situaciones s
      WHERE s.establecimiento_id = ANY($1) AND s.estado NOT IN ('NUEVA', 'EN_REVISION')
        AND NOT EXISTS (SELECT 1 FROM convi.revisiones_convivencia r WHERE r.situacion_id = s.id)`,
  },
  {
    regla: 'Cada revisión apunta a la revisión anterior de su situación',
    consulta: `SELECT count(*) FROM convi.revisiones_convivencia r
      WHERE r.establecimiento_id = ANY($1)
        AND r.revision_anterior_id IS DISTINCT FROM (
          SELECT p.id FROM convi.revisiones_convivencia p
          WHERE p.situacion_id = r.situacion_id AND (p.revisado_en, p.id) < (r.revisado_en, r.id)
          ORDER BY p.revisado_en DESC, p.id DESC LIMIT 1)`,
  },
  {
    regla: 'Las decisiones y los cambios de estado los hace Convivencia activa',
    consulta: `SELECT (SELECT count(*) FROM convi.revisiones_convivencia r
        WHERE r.establecimiento_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM convi.membresias_establecimiento m
          WHERE m.id = r.revisado_por AND m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO'))
      + (SELECT count(*) FROM convi.historial_estados_caso h
        WHERE h.establecimiento_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM convi.membresias_establecimiento m
          WHERE m.id = h.cambiado_por AND m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO'))
      + (SELECT count(*) FROM convi.casos c
        WHERE c.establecimiento_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM convi.membresias_establecimiento m
          WHERE m.id = c.asignado_a_membresia_id AND m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO'))`,
  },
  {
    regla:
      'Una situación vinculada tiene su caso, que comparte un estudiante con ella',
    consulta: `SELECT count(*) FROM convi.situaciones s
      WHERE s.establecimiento_id = ANY($1)
        AND ((s.estado = 'VINCULADA_CASO') <> (s.caso_id IS NOT NULL AND s.vinculado_a_caso_en IS NOT NULL AND s.vinculado_a_caso_por IS NOT NULL)
          OR (s.caso_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM convi.participaciones ps JOIN convi.participaciones pc
              ON pc.persona_id = ps.persona_id AND pc.caso_id = s.caso_id
            WHERE ps.situacion_id = s.id)))`,
  },
  {
    regla:
      'El profesor que reporta tiene asignado el curso el día del registro',
    consulta: `SELECT count(*) FROM convi.situaciones s
      JOIN convi.membresias_establecimiento m ON m.id = s.reportado_por_membresia_id
      WHERE s.establecimiento_id = ANY($1) AND m.codigo_perfil = 'PROFESOR'
        AND NOT EXISTS (SELECT 1 FROM convi.asignaciones_docentes x
          WHERE x.membresia_id = m.id AND x.curso_id = s.curso_contexto_id
            AND (x.fecha_inicio IS NULL OR x.fecha_inicio <= s.reportado_en::date)
            AND (x.fecha_fin IS NULL OR x.fecha_fin >= s.reportado_en::date))`,
  },
  {
    regla:
      'Cada participación usa una matrícula del mismo estudiante vigente el día del hecho',
    consulta: `SELECT count(*) FROM convi.participaciones p
      JOIN convi.situaciones s ON s.id = p.situacion_id
      WHERE p.establecimiento_id = ANY($1)
        AND NOT EXISTS (SELECT 1 FROM convi.matriculas m JOIN convi.estudiantes e ON e.id = m.estudiante_id
          WHERE m.id = p.matricula_contexto_id AND e.persona_id = p.persona_id
            AND m.matriculado_en <= s.ocurrido_en::date
            AND (m.finalizado_en IS NULL OR m.finalizado_en >= s.ocurrido_en::date))`,
  },
  {
    regla: 'Las matrículas de un estudiante no se superponen',
    consulta: `SELECT count(*) FROM convi.matriculas a JOIN convi.matriculas b
        ON b.estudiante_id = a.estudiante_id AND b.id > a.id
       AND daterange(a.matriculado_en, a.finalizado_en, '[]') && daterange(b.matriculado_en, b.finalizado_en, '[]')
      WHERE a.establecimiento_id = ANY($1)`,
  },
  {
    regla: 'Cada caso tiene el estado de su último cambio y cambios permitidos',
    consulta: `SELECT (SELECT count(*) FROM convi.casos c
        LEFT JOIN LATERAL (SELECT h.estado_nuevo, h.cambiado_en FROM convi.historial_estados_caso h
          WHERE h.caso_id = c.id ORDER BY h.cambiado_en DESC, h.id DESC LIMIT 1) u ON true
        WHERE c.establecimiento_id = ANY($1)
          AND (c.estado_actual <> coalesce(u.estado_nuevo, 'EN_ANALISIS')
            OR c.cerrado_en IS DISTINCT FROM CASE WHEN u.estado_nuevo = 'CERRADO' THEN u.cambiado_en END))
      + (SELECT count(*) FROM convi.historial_estados_caso h
        WHERE h.establecimiento_id = ANY($1)
          AND (NOT coalesce(convi.transicion_caso_permitida(h.estado_anterior, h.estado_nuevo), false)
            OR h.estado_anterior IS DISTINCT FROM coalesce((SELECT p.estado_nuevo FROM convi.historial_estados_caso p
              WHERE p.caso_id = h.caso_id AND (p.cambiado_en, p.id) < (h.cambiado_en, h.id)
              ORDER BY p.cambiado_en DESC, p.id DESC LIMIT 1), 'EN_ANALISIS')
            OR (h.estado_nuevo = 'CERRADO' AND nullif(trim(h.resumen_cierre), '') IS NULL)))`,
  },
  {
    regla:
      'Las fechas van en orden: hecho, registro, revisión, decisión y cambios',
    consulta: `SELECT (SELECT count(*) FROM convi.situaciones s
        WHERE s.establecimiento_id = ANY($1) AND (s.reportado_en < s.ocurrido_en OR s.vinculado_a_caso_en < s.reportado_en))
      + (SELECT count(*) FROM convi.revisiones_convivencia r JOIN convi.situaciones s ON s.id = r.situacion_id
        WHERE r.establecimiento_id = ANY($1) AND r.revisado_en < s.reportado_en)
      + (SELECT count(*) FROM convi.historial_estados_caso h JOIN convi.casos c ON c.id = h.caso_id
        WHERE h.establecimiento_id = ANY($1) AND h.cambiado_en < c.registrado_en)
      + (SELECT count(*) FROM convi.aclaraciones_situacion a
        WHERE a.establecimiento_id = ANY($1) AND a.respondido_en < a.solicitado_en)`,
  },
  {
    regla: 'Las aclaraciones las pide Convivencia al profesor que reportó',
    consulta: `SELECT count(*) FROM convi.aclaraciones_situacion a JOIN convi.situaciones s ON s.id = a.situacion_id
      WHERE a.establecimiento_id = ANY($1)
        AND (a.profesor_destinatario_id <> s.reportado_por_membresia_id
          OR NOT EXISTS (SELECT 1 FROM convi.membresias_establecimiento m
            WHERE m.id = a.solicitado_por AND m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO'))`,
  },
  {
    regla: 'Los códigos siguen el formato del año de registro',
    consulta: `SELECT (SELECT count(*) FROM convi.situaciones s WHERE s.establecimiento_id = ANY($1)
        AND s.codigo <> 'SIT-' || to_char(s.reportado_en, 'YYYY') || '-' || substring(s.codigo from '[0-9]{5}$'))
      + (SELECT count(*) FROM convi.casos c WHERE c.establecimiento_id = ANY($1)
        AND c.codigo <> 'CASO-' || to_char(c.registrado_en, 'YYYY') || '-' || substring(c.codigo from '[0-9]{5}$'))`,
  },
  {
    regla: 'Toda referencia apunta a un registro de la misma escuela',
    consulta: `SELECT (SELECT count(*) FROM convi.participaciones p WHERE p.establecimiento_id = ANY($1)
          AND NOT EXISTS (SELECT 1 FROM convi.personas x WHERE x.id = p.persona_id AND x.establecimiento_id = p.establecimiento_id))
      + (SELECT count(*) FROM convi.situaciones s WHERE s.establecimiento_id = ANY($1)
          AND (NOT EXISTS (SELECT 1 FROM convi.membresias_establecimiento x WHERE x.id = s.reportado_por_membresia_id AND x.establecimiento_id = s.establecimiento_id)
            OR (s.categoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM convi.categorias_convivencia x WHERE x.id = s.categoria_id AND x.establecimiento_id = s.establecimiento_id))
            OR (s.caso_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM convi.casos x WHERE x.id = s.caso_id AND x.establecimiento_id = s.establecimiento_id))))
      + (SELECT count(*) FROM convi.matriculas m WHERE m.establecimiento_id = ANY($1)
          AND NOT EXISTS (SELECT 1 FROM convi.cursos x WHERE x.id = m.curso_id AND x.anio_academico_id = m.anio_academico_id AND x.establecimiento_id = m.establecimiento_id))
      + (SELECT count(*) FROM convi.membresias_establecimiento m WHERE m.establecimiento_id = ANY($1)
          AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.auth_usuario_id))`,
  },
];

export async function verificar(
  db: Client,
  escuelas: string[],
): Promise<{ regla: string; cantidad: number }[]> {
  // La zona de la escuela, para que ::date sea el día local como en los triggers.
  await db.query(`SET LOCAL TIME ZONE 'America/Santiago'`);
  const fallas: { regla: string; cantidad: number }[] = [];
  for (const { regla, consulta } of REGLAS) {
    const resultado = await db.query<Record<string, string>>(
      // Con una función, el $1 del reemplazo no se lee como grupo capturado.
      consulta.replace(/\$1/g, () => '$1::uuid[]'),
      [escuelas],
    );
    const cantidad = Number(Object.values(resultado.rows[0])[0]);
    if (cantidad > 0) fallas.push({ regla, cantidad });
  }
  return fallas;
}

export const CANTIDAD_REGLAS = REGLAS.length;

/**
 * Deja al día las estadísticas de las tablas cargadas, para que las consultas
 * respondan rápido desde el primer momento sin esperar al autovacuum.
 */
export async function actualizarEstadisticas(db: Client) {
  await db.query(
    `ANALYZE ${TABLAS.filter((t) => t !== 'establecimientos')
      .map((t) => `convi.${t}`)
      .join(', ')}, convi.eventos_auditoria`,
  );
}
