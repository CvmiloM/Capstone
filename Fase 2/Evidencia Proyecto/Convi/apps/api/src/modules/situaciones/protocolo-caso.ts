import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type {
  NuevaRevisionNormativa,
  RevisionNormativa,
} from './revision-normativa.js';

// PB-082 (HU-071): protocolo aplicado al caso. Se elige una versión publicada
// y vigente (CA1, la base solo acepta publicadas) y se crean sus pasos para el
// caso con su vencimiento; la versión aplicada no cambia aunque el catálogo sí
// (CA4). Si no aplica ninguno, se registra una revisión del caso con su
// aplicabilidad y fundamento, sin una aplicación ficticia (CA2).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LARGO_MAXIMO_FUNDAMENTO_PROTOCOLO = 4000;

// La fecha de hoy en la zona horaria de la escuela (HU-021).
const HOY = `(now() AT TIME ZONE (SELECT zona_horaria FROM convi.establecimientos
  WHERE id = convi.establecimiento_actual()))::date`;

// Igual que en la revisión normativa (PB-155): protocolos oficiales activos
// con una versión publicada y vigente hoy.
export const PROTOCOLOS_APLICABLES = `
  FROM convi.versiones_protocolo vp
  JOIN convi.protocolos pr ON pr.id = vp.protocolo_id
  WHERE vp.estado = 'PUBLICADO' AND pr.estado = 'ACTIVO'
    AND pr.naturaleza = 'OFICIAL'
    AND (vp.vigente_desde IS NULL OR vp.vigente_desde <= ${HOY})
    AND (vp.vigente_hasta IS NULL OR vp.vigente_hasta >= ${HOY})`;

export type Aplicacion = { version_protocolo_id: string; fundamento: string };

export function validarAplicacion(cuerpo: unknown): Aplicacion {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};
  const version =
    typeof datos.version_protocolo_id === 'string'
      ? datos.version_protocolo_id
      : '';
  if (!UUID.test(version))
    errores.version_protocolo_id = 'Elige el protocolo que se aplica.';
  const fundamento =
    typeof datos.fundamento === 'string' ? datos.fundamento.trim() : '';
  if (!fundamento)
    errores.fundamento = 'Explica por qué se aplica este protocolo al caso.';
  else if (fundamento.length > LARGO_MAXIMO_FUNDAMENTO_PROTOCOLO)
    errores.fundamento = `El fundamento admite hasta ${LARGO_MAXIMO_FUNDAMENTO_PROTOCOLO} caracteres.`;
  if (Object.keys(errores).length > 0)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se aplicó el protocolo.',
      errores,
    });
  return { version_protocolo_id: version.toLowerCase(), fundamento };
}

/** Versiones que se pueden aplicar hoy, con su cantidad de pasos. */
export async function protocolosAplicables(
  db: PoolClient,
): Promise<{ id: string; nombre: string; pasos: number }[]> {
  const versiones = await db.query<{
    id: string;
    nombre: string;
    pasos: number;
  }>(
    `SELECT vp.id, pr.nombre || ' · versión ' || vp.numero_version AS nombre,
            (SELECT count(*) FROM convi.pasos_protocolo p
             WHERE p.version_protocolo_id = vp.id)::int AS pasos
     ${PROTOCOLOS_APLICABLES}
     ORDER BY pr.nombre`,
  );
  return versiones.rows;
}

export type ProtocoloAplicado = {
  id: string;
  protocolo: string;
  codigo: string;
  numero_version: number;
  estado: string;
  fundamento: string;
  aplicado_por: string;
  aplicado_en: Date;
  pasos: {
    id: string;
    orden_paso: number;
    nombre: string;
    descripcion: string | null;
    estado: string;
    vence_en: Date | null;
    requiere_evidencia: boolean;
    es_obligatorio: boolean;
    responsable: string | null;
  }[];
};

export async function protocolosDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<ProtocoloAplicado[]> {
  const aplicados = await db.query<Omit<ProtocoloAplicado, 'pasos'>>(
    `SELECT pc.id, pr.nombre AS protocolo, pr.codigo, vp.numero_version,
            pc.estado, pc.fundamento, pc.aplicado_en,
            p.nombres || ' ' || p.apellidos AS aplicado_por
     FROM convi.protocolos_caso pc
     JOIN convi.versiones_protocolo vp ON vp.id = pc.version_protocolo_id
     JOIN convi.protocolos pr ON pr.id = vp.protocolo_id
     JOIN convi.membresias_establecimiento m ON m.id = pc.aplicado_por
     JOIN convi.personas p ON p.id = m.persona_id
     WHERE pc.caso_id = $1
     ORDER BY pc.aplicado_en, pc.id`,
    [casoId],
  );
  if (aplicados.rows.length === 0) return [];
  const pasos = await db.query<
    ProtocoloAplicado['pasos'][number] & { protocolo_caso_id: string }
  >(
    `SELECT ep.protocolo_caso_id, ep.id, pp.orden_paso, pp.nombre,
            pp.descripcion, ep.estado, ep.vence_en, pp.requiere_evidencia,
            pp.es_obligatorio, pr.nombres || ' ' || pr.apellidos AS responsable
     FROM convi.estados_pasos_protocolo_caso ep
     JOIN convi.pasos_protocolo pp ON pp.id = ep.paso_protocolo_id
     LEFT JOIN convi.membresias_establecimiento mr ON mr.id = ep.responsable_id
     LEFT JOIN convi.personas pr ON pr.id = mr.persona_id
     WHERE ep.protocolo_caso_id = ANY($1::uuid[])
     ORDER BY pp.orden_paso`,
    [aplicados.rows.map((a) => a.id)],
  );
  return aplicados.rows.map((aplicado) => ({
    ...aplicado,
    pasos: pasos.rows
      .filter((paso) => paso.protocolo_caso_id === aplicado.id)
      .map(({ protocolo_caso_id: _protocolo, ...paso }) => paso),
  }));
}

/**
 * Crea los pasos del protocolo para el caso. El vencimiento se cuenta desde
 * que se aplica, en la hora de la escuela. Decisión del PO (por defecto): los
 * días hábiles son de lunes a viernes, sin feriados, y el responsable de cada
 * paso es el responsable del caso si sigue activo en Convivencia (HU-048 CA2).
 */
export async function crearPasosDelCaso(
  db: PoolClient,
  protocoloCasoId: string,
  casoId: string,
) {
  await db.query(
    `INSERT INTO convi.estados_pasos_protocolo_caso
       (establecimiento_id, protocolo_caso_id, paso_protocolo_id, vence_en,
        responsable_id)
     SELECT convi.establecimiento_actual(), pc.id, p.id,
            CASE
              WHEN p.valor_plazo IS NULL THEN NULL
              WHEN p.unidad_plazo = 'MINUTOS'
                THEN pc.aplicado_en + p.valor_plazo * interval '1 minute'
              WHEN p.unidad_plazo = 'HORAS'
                THEN pc.aplicado_en + p.valor_plazo * interval '1 hour'
              WHEN p.unidad_plazo = 'DIAS'
                THEN pc.aplicado_en + p.valor_plazo * interval '1 day'
              WHEN p.valor_plazo = 0 THEN pc.aplicado_en
              ELSE (
                SELECT (d::date + (pc.aplicado_en AT TIME ZONE e.zona_horaria)::time)
                         AT TIME ZONE e.zona_horaria
                FROM generate_series(
                       (pc.aplicado_en AT TIME ZONE e.zona_horaria)::date + 1,
                       (pc.aplicado_en AT TIME ZONE e.zona_horaria)::date
                         + p.valor_plazo * 2 + 7,
                       interval '1 day') d
                WHERE extract(isodow FROM d) < 6
                ORDER BY d OFFSET p.valor_plazo - 1 LIMIT 1)
            END,
            (SELECT m.id FROM convi.casos c
             JOIN convi.membresias_establecimiento m
               ON m.id = c.asignado_a_membresia_id
             WHERE c.id = $2 AND m.codigo_perfil = 'CONVIVENCIA'
               AND m.estado = 'ACTIVO')
     FROM convi.protocolos_caso pc
     JOIN convi.pasos_protocolo p ON p.version_protocolo_id = pc.version_protocolo_id
     JOIN convi.establecimientos e ON e.id = pc.establecimiento_id
     WHERE pc.id = $1`,
    [protocoloCasoId, casoId],
  );
}

/** HU-071 CA2 y CA3: revisiones del caso sin protocolo, con sus páginas consultadas. */
export async function revisionesNormativasDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<RevisionNormativa[]> {
  const revisiones = await db.query<Omit<RevisionNormativa, 'referencias'>>(
    `SELECT r.id, r.revisado_en, p.nombres || ' ' || p.apellidos AS revisado_por,
            r.aplicabilidad, r.modo_revision, r.fundamento,
            pr.nombre || ' · versión ' || vp.numero_version AS protocolo
     FROM convi.revisiones_convivencia r
     JOIN convi.membresias_establecimiento m ON m.id = r.revisado_por
     JOIN convi.personas p ON p.id = m.persona_id
     LEFT JOIN convi.versiones_protocolo vp
       ON vp.id = r.version_protocolo_seleccionada_id
     LEFT JOIN convi.protocolos pr ON pr.id = vp.protocolo_id
     WHERE r.caso_id = $1 AND r.tipo_revision = 'CONSULTA'
     ORDER BY r.revisado_en, r.id`,
    [casoId],
  );
  if (revisiones.rows.length === 0) return [];
  const referencias = await db.query<
    RevisionNormativa['referencias'][number] & { revision_id: string }
  >(
    `SELECT rr.revision_id, rr.version_documento_id, d.titulo AS documento, v.etiqueta_version AS version,
            rr.pagina_desde, rr.pagina_hasta, rr.titulo_seccion
     FROM convi.referencias_revision_normativa rr
     JOIN convi.versiones_documento v ON v.id = rr.version_documento_id
     JOIN convi.documentos_institucionales d ON d.id = v.documento_id
     WHERE rr.revision_id = ANY($1::uuid[])
     ORDER BY d.titulo, rr.pagina_desde NULLS LAST, rr.id`,
    [revisiones.rows.map((r) => r.id)],
  );
  return revisiones.rows.map((revision) => ({
    ...revision,
    referencias: referencias.rows
      .filter((r) => r.revision_id === revision.id)
      .map(({ revision_id: _revision, ...referencia }) => referencia),
  }));
}

/** Inserta la revisión del caso (CONSULTA) y sus páginas en la misma transacción. */
export async function insertarRevisionNormativaDelCaso(
  db: PoolClient,
  casoId: string,
  datos: NuevaRevisionNormativa,
): Promise<{ id: string }> {
  const revision = await db.query<{ id: string }>(
    `INSERT INTO convi.revisiones_convivencia
       (establecimiento_id, caso_id, tipo_revision, fundamento, modo_revision,
        aplicabilidad, version_protocolo_seleccionada_id, revisado_por)
     VALUES (convi.establecimiento_actual(), $1, 'CONSULTA', $2, $3, $4, $5,
             convi.membresia_actual())
     RETURNING id`,
    [
      casoId,
      datos.fundamento,
      datos.modo_revision,
      datos.aplicabilidad,
      datos.version_protocolo_id,
    ],
  );
  const guardada = revision.rows[0];
  if (datos.referencias.length > 0)
    await db.query(
      `INSERT INTO convi.referencias_revision_normativa
         (establecimiento_id, revision_id, version_documento_id, pagina_desde,
          pagina_hasta, titulo_seccion)
       SELECT convi.establecimiento_actual(), $1, x.version, x.desde, x.hasta,
              x.seccion
       FROM unnest($2::uuid[], $3::int[], $4::int[], $5::text[])
         AS x(version, desde, hasta, seccion)`,
      [
        guardada.id,
        datos.referencias.map((r) => r.version_documento_id),
        datos.referencias.map((r) => r.pagina_desde),
        datos.referencias.map((r) => r.pagina_hasta),
        datos.referencias.map((r) => r.titulo_seccion),
      ],
    );
  return guardada;
}
