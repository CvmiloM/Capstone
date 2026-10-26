import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';

// PB-155 (HU-134): antes de decidir, Convivencia registra lo que indica el
// reglamento o el protocolo. Es una revisión de consulta (tipo CONSULTA):
// no cambia el estado de la situación (CA4) y no se edita ni se borra (CA5),
// porque la base solo permite insertar en revisiones_convivencia y en
// referencias_revision_normativa. Se valida aquí aunque el formulario también
// lo haga (HU-119).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const APLICABILIDADES = [
  'APLICABLE',
  'NO_APLICABLE',
  'POR_CONFIRMAR',
] as const;
export const MODOS_REVISION = ['MANUAL', 'ASISTIDA_IA'] as const;
export const LARGO_MAXIMO_FUNDAMENTO = 4000;
export const LARGO_MAXIMO_SECCION = 220;
export const MAXIMO_REFERENCIAS = 10;

export type ReferenciaNormativa = {
  version_documento_id: string;
  pagina_desde: number | null;
  pagina_hasta: number | null;
  titulo_seccion: string | null;
};

export type NuevaRevisionNormativa = {
  aplicabilidad: (typeof APLICABILIDADES)[number];
  modo_revision: (typeof MODOS_REVISION)[number];
  fundamento: string;
  version_protocolo_id: string | null;
  referencias: ReferenciaNormativa[];
};

export type RevisionNormativa = {
  id: string;
  revisado_en: Date;
  revisado_por: string;
  aplicabilidad: string;
  modo_revision: string;
  fundamento: string;
  /** Protocolo y versión elegidos, si se eligió uno. */
  protocolo: string | null;
  referencias: {
    version_documento_id: string;
    documento: string;
    version: string;
    pagina_desde: number | null;
    pagina_hasta: number | null;
    titulo_seccion: string | null;
  }[];
};

/** Versiones publicadas y vigentes que se pueden elegir en el formulario. */
export type OpcionesNormativa = {
  protocolos: { id: string; nombre: string }[];
  documentos: { id: string; nombre: string }[];
};

function esDe<T extends string>(
  valor: unknown,
  permitidos: readonly T[],
): valor is T {
  return (
    typeof valor === 'string' &&
    (permitidos as readonly string[]).includes(valor)
  );
}

function pagina(valor: unknown): number | null | 'invalida' {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = typeof valor === 'string' ? Number(valor.trim()) : valor;
  return typeof numero === 'number' && Number.isInteger(numero) && numero > 0
    ? numero
    : 'invalida';
}

export function validarRevisionNormativa(
  cuerpo: unknown,
): NuevaRevisionNormativa {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  // CA1: aplicabilidad y fundamento obligatorios.
  const aplicabilidad = esDe(datos.aplicabilidad, APLICABILIDADES)
    ? datos.aplicabilidad
    : null;
  if (!aplicabilidad)
    errores.aplicabilidad = 'Indica si la norma es aplicable.';

  const fundamento =
    typeof datos.fundamento === 'string' ? datos.fundamento.trim() : '';
  if (!fundamento)
    errores.fundamento =
      'Escribe qué indica el reglamento o el protocolo sobre esta situación.';
  else if (fundamento.length > LARGO_MAXIMO_FUNDAMENTO)
    errores.fundamento = `El fundamento admite hasta ${LARGO_MAXIMO_FUNDAMENTO} caracteres.`;

  // CA3: manual o asistida por IA. Sin indicarlo, se entiende manual.
  const modo =
    datos.modo_revision === undefined || datos.modo_revision === ''
      ? 'MANUAL'
      : esDe(datos.modo_revision, MODOS_REVISION)
        ? datos.modo_revision
        : null;
  if (!modo)
    errores.modo_revision =
      'Indica si la revisión fue manual o asistida por IA.';

  // CA1: la versión del protocolo es opcional y solo tiene sentido si la
  // norma aplica o falta confirmarlo.
  const protocolo =
    datos.version_protocolo_id === undefined ||
    datos.version_protocolo_id === null ||
    datos.version_protocolo_id === ''
      ? null
      : typeof datos.version_protocolo_id === 'string' &&
          UUID.test(datos.version_protocolo_id)
        ? datos.version_protocolo_id.toLowerCase()
        : 'invalido';
  if (protocolo === 'invalido')
    errores.version_protocolo_id = 'Elige un protocolo de la lista.';
  else if (protocolo && aplicabilidad === 'NO_APLICABLE')
    errores.version_protocolo_id =
      'Si la norma no es aplicable, no elijas un protocolo.';

  // CA2: páginas consultadas, cada una con su versión de documento y al
  // menos una página o la sección.
  const referencias: ReferenciaNormativa[] = [];
  const lista = datos.referencias === undefined ? [] : datos.referencias;
  if (!Array.isArray(lista) || lista.length > MAXIMO_REFERENCIAS) {
    errores.referencias = `Indica hasta ${MAXIMO_REFERENCIAS} páginas consultadas.`;
  } else {
    lista.forEach((elemento: unknown, indice) => {
      if (errores.referencias) return;
      const fila = (
        typeof elemento === 'object' && elemento !== null ? elemento : {}
      ) as Record<string, unknown>;
      const numero = indice + 1;
      const version =
        typeof fila.version_documento_id === 'string' &&
        UUID.test(fila.version_documento_id)
          ? fila.version_documento_id.toLowerCase()
          : null;
      const desde = pagina(fila.pagina_desde);
      const hasta = pagina(fila.pagina_hasta);
      const seccion =
        typeof fila.titulo_seccion === 'string'
          ? fila.titulo_seccion.trim()
          : '';
      if (!version)
        errores.referencias = `Página consultada ${numero}: elige el documento.`;
      else if (desde === 'invalida' || hasta === 'invalida')
        errores.referencias = `Página consultada ${numero}: las páginas son números enteros mayores que cero.`;
      else if (desde === null && hasta !== null)
        errores.referencias = `Página consultada ${numero}: indica la página desde.`;
      else if (desde !== null && hasta !== null && hasta < desde)
        errores.referencias = `Página consultada ${numero}: la página hasta no puede ser menor que la página desde.`;
      else if (desde === null && !seccion)
        errores.referencias = `Página consultada ${numero}: indica la página o la sección.`;
      else if (seccion.length > LARGO_MAXIMO_SECCION)
        errores.referencias = `Página consultada ${numero}: la sección admite hasta ${LARGO_MAXIMO_SECCION} caracteres.`;
      else
        referencias.push({
          version_documento_id: version,
          pagina_desde: desde,
          pagina_hasta: hasta,
          titulo_seccion: seccion || null,
        });
    });
  }

  if (!aplicabilidad || !modo || Object.keys(errores).length > 0) {
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se guardó la revisión normativa.',
      errores,
    });
  }
  return {
    aplicabilidad,
    modo_revision: modo,
    fundamento,
    version_protocolo_id: protocolo,
    referencias,
  };
}

// La fecha de hoy en la zona horaria de la escuela (HU-021).
const HOY = `(now() AT TIME ZONE (SELECT zona_horaria FROM convi.establecimientos
  WHERE id = convi.establecimiento_actual()))::date`;

// Solo protocolos oficiales con una versión publicada y vigente hoy.
const PROTOCOLOS_VIGENTES = `
  FROM convi.versiones_protocolo vp
  JOIN convi.protocolos pr ON pr.id = vp.protocolo_id
  WHERE vp.estado = 'PUBLICADO' AND pr.estado = 'ACTIVO'
    AND pr.naturaleza = 'OFICIAL'
    AND (vp.vigente_desde IS NULL OR vp.vigente_desde <= ${HOY})
    AND (vp.vigente_hasta IS NULL OR vp.vigente_hasta >= ${HOY})`;

// Documentos institucionales con una versión publicada y vigente hoy. Las
// plantillas no son normativa y no se citan.
const DOCUMENTOS_VIGENTES = `
  FROM convi.versiones_documento v
  JOIN convi.documentos_institucionales d ON d.id = v.documento_id
  WHERE v.estado = 'PUBLICADO' AND d.estado = 'ACTIVO'
    AND d.tipo_documento <> 'PLANTILLA'
    AND v.vigente_desde <= ${HOY}
    AND (v.vigente_hasta IS NULL OR v.vigente_hasta >= ${HOY})`;

export async function opcionesNormativa(
  db: PoolClient,
): Promise<OpcionesNormativa> {
  const protocolos = await db.query<OpcionesNormativa['protocolos'][number]>(
    `SELECT vp.id, pr.nombre || ' · versión ' || vp.numero_version AS nombre
     ${PROTOCOLOS_VIGENTES}
     ORDER BY pr.nombre, vp.numero_version DESC`,
  );
  const documentos = await db.query<OpcionesNormativa['documentos'][number]>(
    `SELECT v.id, d.titulo || ' · ' || v.etiqueta_version AS nombre
     ${DOCUMENTOS_VIGENTES}
     ORDER BY d.titulo, v.vigente_desde DESC`,
  );
  return { protocolos: protocolos.rows, documentos: documentos.rows };
}

/** Revisiones normativas de una situación, de la más antigua a la más reciente. */
export async function revisionesNormativas(
  db: PoolClient,
  situacionId: string,
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
     WHERE r.situacion_id = $1 AND r.tipo_revision = 'CONSULTA'
     ORDER BY r.revisado_en, r.id`,
    [situacionId],
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

/**
 * Comprueba que el protocolo y los documentos elegidos sigan publicados y
 * vigentes. La base no lo exige para una consulta, así que lo hace la API.
 */
export async function comprobarNormativaVigente(
  db: PoolClient,
  datos: NuevaRevisionNormativa,
): Promise<Record<string, string>> {
  const errores: Record<string, string> = {};
  if (datos.version_protocolo_id) {
    const protocolo = await db.query(
      `SELECT 1 ${PROTOCOLOS_VIGENTES} AND vp.id = $1`,
      [datos.version_protocolo_id],
    );
    if (protocolo.rowCount === 0)
      errores.version_protocolo_id =
        'Ese protocolo ya no está publicado o vigente. Recarga la página y elige otro.';
  }
  const versiones = [
    ...new Set(datos.referencias.map((r) => r.version_documento_id)),
  ];
  if (versiones.length > 0) {
    const vigentes = await db.query(
      `SELECT 1 ${DOCUMENTOS_VIGENTES} AND v.id = ANY($1::uuid[])`,
      [versiones],
    );
    if (vigentes.rowCount !== versiones.length)
      errores.referencias =
        'Algún documento ya no está publicado o vigente. Recarga la página y vuelve a elegirlo.';
  }
  return errores;
}

/**
 * Inserta la revisión de consulta y sus páginas consultadas en la misma
 * transacción. La base exige indicar la última revisión de la situación
 * (PB-139): la lee aquí mismo, porque una consulta no decide nada y no debe
 * chocar con otra revisión guardada mientras se escribía.
 */
export async function insertarRevisionNormativa(
  db: PoolClient,
  situacionId: string,
  datos: NuevaRevisionNormativa,
): Promise<{ id: string; revisado_en: Date }> {
  const anterior = await db.query<{ id: string }>(
    `SELECT id FROM convi.revisiones_convivencia
     WHERE situacion_id = $1
     ORDER BY revisado_en DESC, id DESC LIMIT 1`,
    [situacionId],
  );
  const revision = await db.query<{ id: string; revisado_en: Date }>(
    `INSERT INTO convi.revisiones_convivencia
       (establecimiento_id, situacion_id, tipo_revision, fundamento,
        modo_revision, aplicabilidad, version_protocolo_seleccionada_id,
        revisado_por, revision_anterior_id)
     VALUES (convi.establecimiento_actual(), $1, 'CONSULTA', $2, $3, $4, $5,
             convi.membresia_actual(), $6)
     RETURNING id, revisado_en`,
    [
      situacionId,
      datos.fundamento,
      datos.modo_revision,
      datos.aplicabilidad,
      datos.version_protocolo_id,
      anterior.rows[0]?.id ?? null,
    ],
  );
  const guardada = revision.rows[0];
  if (datos.referencias.length > 0) {
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
  }
  return guardada;
}
