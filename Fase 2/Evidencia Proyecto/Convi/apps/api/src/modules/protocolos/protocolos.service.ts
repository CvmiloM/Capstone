import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  validarPaso,
  validarProtocolo,
  validarPublicacion,
  validarVersion,
  type DatosPaso,
} from './protocolo.js';

// PB-081 (HU-070) y PB-083 (HU-072): catálogo de protocolos de la escuela.
// Convivencia prepara cada versión en Borrador con sus pasos y la publica
// después de revisarla; la base impide editar una versión publicada o sus
// pasos (CA3) y exige revisor, documento de origen y fecha de publicación
// para publicar (CA1). Aplicar una versión a un caso es PB-082 (casos).
// Decisión del PO (por defecto): por ahora solo Convivencia lo usa; el
// administrador también podrá publicar cuando tenga su pantalla.
const PERFILES: Perfil[] = ['CONVIVENCIA'];

const NO_EXISTE = 'El protocolo no existe.';
const NO_EXISTE_VERSION = 'La versión del protocolo no existe.';
const SOLO_BORRADOR =
  'Esta versión ya está publicada: no se modifica. Crea una versión nueva para cambiarla.';

// La fecha de hoy en la zona horaria de la escuela (HU-021).
const HOY = `(now() AT TIME ZONE (SELECT zona_horaria FROM convi.establecimientos
  WHERE id = convi.establecimiento_actual()))::date`;

export type ProtocoloLista = {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  versiones: number;
  /** Número de la última versión publicada y desde cuándo rige. */
  version_publicada: number | null;
  vigente_desde: string | null;
  /** La versión en Borrador, si hay una. */
  borrador_id: string | null;
  borrador_numero: number | null;
};

export type VersionProtocolo = {
  id: string;
  numero_version: number;
  estado: string;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  publicado_en: Date | null;
  revisado_por: string | null;
  version_documento_origen_id: string | null;
  documento_origen: string | null;
  notas: string | null;
  creado_por: string;
  creado_en: Date;
  pasos: number;
};

export type DetalleProtocolo = Omit<
  ProtocoloLista,
  'versiones' | 'version_publicada' | 'vigente_desde' | 'borrador_numero'
> & { versiones: VersionProtocolo[] };

export type PasoProtocolo = DatosPaso & { id: string };

export type DetalleVersion = VersionProtocolo & {
  protocolo_id: string;
  protocolo_codigo: string;
  protocolo_nombre: string;
  pasos_detalle: PasoProtocolo[];
  /** Versiones de documentos institucionales que se pueden indicar como origen. */
  documentos_origen: { id: string; nombre: string }[];
  /** AAAA-MM-DD de hoy en la escuela, para proponer la fecha de vigencia. */
  hoy: string;
};

const COLUMNAS_VERSION = `
  v.id, v.numero_version, v.estado, v.vigente_desde::text AS vigente_desde,
  v.vigente_hasta::text AS vigente_hasta, v.publicado_en,
  pv.nombres || ' ' || pv.apellidos AS revisado_por,
  v.version_documento_origen_id,
  d.titulo || ' · ' || dv.etiqueta_version AS documento_origen, v.notas,
  pc.nombres || ' ' || pc.apellidos AS creado_por, v.creado_en,
  (SELECT count(*) FROM convi.pasos_protocolo p
   WHERE p.version_protocolo_id = v.id)::int AS pasos`;

const DESDE_VERSION = `
  FROM convi.versiones_protocolo v
  JOIN convi.membresias_establecimiento mc ON mc.id = v.creado_por
  JOIN convi.personas pc ON pc.id = mc.persona_id
  LEFT JOIN convi.membresias_establecimiento mv ON mv.id = v.revisado_por
  LEFT JOIN convi.personas pv ON pv.id = mv.persona_id
  LEFT JOIN convi.versiones_documento dv ON dv.id = v.version_documento_origen_id
  LEFT JOIN convi.documentos_institucionales d ON d.id = dv.documento_id`;

const COLUMNAS_PASO = `
  id, orden_paso, nombre, descripcion, valor_plazo, unidad_plazo,
  requiere_evidencia, es_obligatorio`;

// 23505: se repitió el código del protocolo, el número de versión o el
// orden de un paso; 40001: otra transacción cambió la fila bloqueada.
function codigoError(error: unknown) {
  return (error ?? {}) as { code?: string; constraint?: string };
}

@Injectable()
export class ProtocolosService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      trabajo,
    );
  }

  listar(sesion: Sesion): Promise<ProtocoloLista[]> {
    return this.operar(sesion, async (db) => {
      const protocolos = await db.query<ProtocoloLista>(
        `SELECT pr.id, pr.codigo, pr.nombre, pr.estado,
                (SELECT count(*) FROM convi.versiones_protocolo v
                 WHERE v.protocolo_id = pr.id)::int AS versiones,
                pub.numero_version AS version_publicada,
                pub.vigente_desde::text AS vigente_desde,
                bor.id AS borrador_id, bor.numero_version AS borrador_numero
         FROM convi.protocolos pr
         LEFT JOIN LATERAL (
           SELECT numero_version, vigente_desde FROM convi.versiones_protocolo v
           WHERE v.protocolo_id = pr.id AND v.estado = 'PUBLICADO'
           ORDER BY numero_version DESC LIMIT 1) pub ON true
         LEFT JOIN LATERAL (
           SELECT id, numero_version FROM convi.versiones_protocolo v
           WHERE v.protocolo_id = pr.id AND v.estado = 'BORRADOR'
           ORDER BY numero_version DESC LIMIT 1) bor ON true
         WHERE pr.naturaleza = 'OFICIAL'
         ORDER BY pr.estado, pr.nombre`,
      );
      return protocolos.rows;
    });
  }

  // shortcut: catálogo de hasta 200 protocolos, paginar si una escuela supera ese tamaño.
  catalogoAdministrativo(sesion: Sesion) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['ADMIN'] },
      async (db) => {
        const r = await db.query(`SELECT pr.id, pr.codigo, pr.nombre, pr.estado,
        v.numero_version, v.estado AS estado_version,
        coalesce((SELECT jsonb_agg(jsonb_build_object('orden', p.orden_paso, 'nombre', p.nombre, 'descripcion', p.descripcion) ORDER BY p.orden_paso)
          FROM convi.pasos_protocolo p WHERE p.version_protocolo_id = v.id), '[]'::jsonb) AS pasos
        FROM convi.protocolos pr LEFT JOIN LATERAL (
          SELECT id, numero_version, estado FROM convi.versiones_protocolo
          WHERE protocolo_id = pr.id ORDER BY (estado = 'PUBLICADO') DESC, numero_version DESC LIMIT 1
        ) v ON true
        WHERE pr.establecimiento_id = convi.establecimiento_actual() AND pr.naturaleza = 'OFICIAL'
        ORDER BY pr.nombre LIMIT 200`);
        return r.rows;
      },
    );
  }

  // HU-070 CA1: el protocolo nace con su versión 1 en Borrador, con quién la creó.
  crear(
    sesion: Sesion,
    cuerpo: unknown,
  ): Promise<{ id: string; version_id: string }> {
    const datos = validarProtocolo(cuerpo);
    return this.operar(sesion, async (db) => {
      const protocolo = await db
        .query<{ id: string }>(
          `INSERT INTO convi.protocolos (establecimiento_id, codigo, nombre)
           VALUES (convi.establecimiento_actual(), $1, $2)
           RETURNING id`,
          [datos.codigo, datos.nombre],
        )
        .catch((error: unknown) => {
          if (codigoError(error).code === '23505')
            throw new BadRequestException({
              mensaje: 'Revisa los datos marcados. No se creó el protocolo.',
              errores: { codigo: 'Ya hay un protocolo con ese código.' },
            });
          throw error;
        });
      const version = await db.query<{ id: string }>(
        `INSERT INTO convi.versiones_protocolo
           (establecimiento_id, protocolo_id, numero_version, creado_por)
         VALUES (convi.establecimiento_actual(), $1, 1, convi.membresia_actual())
         RETURNING id`,
        [protocolo.rows[0].id],
      );
      return { id: protocolo.rows[0].id, version_id: version.rows[0].id };
    });
  }

  detalle(sesion: Sesion, id: string): Promise<DetalleProtocolo> {
    return this.operar(sesion, async (db) => {
      const protocolo = await db.query<
        Omit<DetalleProtocolo, 'versiones' | 'borrador_id'>
      >(
        `SELECT id, codigo, nombre, estado FROM convi.protocolos
         WHERE id = $1 AND naturaleza = 'OFICIAL'`,
        [id],
      );
      if (!protocolo.rows[0]) throw new NotFoundException(NO_EXISTE);
      const versiones = await db.query<VersionProtocolo>(
        `SELECT ${COLUMNAS_VERSION} ${DESDE_VERSION}
         WHERE v.protocolo_id = $1
         ORDER BY v.numero_version DESC`,
        [id],
      );
      return {
        ...protocolo.rows[0],
        borrador_id:
          versiones.rows.find((v) => v.estado === 'BORRADOR')?.id ?? null,
        versiones: versiones.rows,
      };
    });
  }

  // HU-070 CA5: una versión nueva parte con los pasos y el documento de
  // origen de la última, en filas propias; la versión ya aplicada no cambia.
  // Decisión del PO (por defecto): hay a lo más un Borrador por protocolo.
  nuevaVersion(sesion: Sesion, protocoloId: string): Promise<{ id: string }> {
    return this.operar(sesion, async (db) => {
      const protocolo = await db.query(
        `SELECT 1 FROM convi.protocolos
         WHERE id = $1 AND naturaleza = 'OFICIAL' FOR UPDATE`,
        [protocoloId],
      );
      if (protocolo.rowCount === 0) throw new NotFoundException(NO_EXISTE);
      const ultima = await db.query<{
        id: string;
        numero_version: number;
        estado: string;
        version_documento_origen_id: string | null;
      }>(
        `SELECT id, numero_version, estado, version_documento_origen_id
         FROM convi.versiones_protocolo WHERE protocolo_id = $1
         ORDER BY numero_version DESC LIMIT 1`,
        [protocoloId],
      );
      const anterior = ultima.rows[0];
      if (anterior?.estado === 'BORRADOR')
        throw new ConflictException(
          `Ya hay una versión en borrador (versión ${anterior.numero_version}). Termínala antes de crear otra.`,
        );
      const version = await db.query<{ id: string }>(
        `INSERT INTO convi.versiones_protocolo
           (establecimiento_id, protocolo_id, numero_version,
            version_documento_origen_id, creado_por)
         VALUES (convi.establecimiento_actual(), $1, $2, $3,
                 convi.membresia_actual())
         RETURNING id`,
        [
          protocoloId,
          (anterior?.numero_version ?? 0) + 1,
          anterior?.version_documento_origen_id ?? null,
        ],
      );
      if (anterior)
        await db.query(
          `INSERT INTO convi.pasos_protocolo
             (establecimiento_id, version_protocolo_id, orden_paso, nombre,
              descripcion, codigo_rol_responsable, valor_plazo, unidad_plazo,
              requiere_evidencia, es_obligatorio)
           SELECT convi.establecimiento_actual(), $1, orden_paso, nombre,
                  descripcion, codigo_rol_responsable, valor_plazo,
                  unidad_plazo, requiere_evidencia, es_obligatorio
           FROM convi.pasos_protocolo WHERE version_protocolo_id = $2`,
          [version.rows[0].id, anterior.id],
        );
      return version.rows[0];
    });
  }

  detalleVersion(sesion: Sesion, id: string): Promise<DetalleVersion> {
    return this.operar(sesion, async (db) => {
      const version = await db.query<
        Omit<DetalleVersion, 'pasos_detalle' | 'documentos_origen' | 'hoy'>
      >(
        `SELECT ${COLUMNAS_VERSION}, pr.id AS protocolo_id,
                pr.codigo AS protocolo_codigo, pr.nombre AS protocolo_nombre
         ${DESDE_VERSION}
         JOIN convi.protocolos pr ON pr.id = v.protocolo_id
         WHERE v.id = $1 AND pr.naturaleza = 'OFICIAL'`,
        [id],
      );
      if (!version.rows[0]) throw new NotFoundException(NO_EXISTE_VERSION);
      const pasos = await db.query<PasoProtocolo>(
        `SELECT ${COLUMNAS_PASO} FROM convi.pasos_protocolo
         WHERE version_protocolo_id = $1 ORDER BY orden_paso`,
        [id],
      );
      // El documento de origen se elige entre los documentos institucionales
      // de la escuela (PB-078); las plantillas no son fuente de un protocolo.
      const documentos = await db.query<{ id: string; nombre: string }>(
        `SELECT dv.id, d.titulo || ' · ' || dv.etiqueta_version ||
                CASE WHEN dv.estado = 'BORRADOR' THEN ' (borrador)' ELSE '' END AS nombre
         FROM convi.versiones_documento dv
         JOIN convi.documentos_institucionales d ON d.id = dv.documento_id
         WHERE d.estado = 'ACTIVO' AND d.tipo_documento <> 'PLANTILLA'
           AND dv.estado <> 'ARCHIVADO'
         ORDER BY d.titulo, dv.etiqueta_version`,
      );
      const hoy = await db.query<{ hoy: string }>(`SELECT ${HOY}::text AS hoy`);
      return {
        ...version.rows[0],
        pasos_detalle: pasos.rows,
        documentos_origen: documentos.rows,
        hoy: hoy.rows[0].hoy,
      };
    });
  }

  // HU-070 CA1 y CA4: el documento de origen y las notas se cambian solo en Borrador.
  actualizarVersion(sesion: Sesion, id: string, cuerpo: unknown) {
    const datos = validarVersion(cuerpo);
    return this.operar(sesion, async (db) => {
      await versionEnBorrador(db, id);
      if (datos.version_documento_origen_id) {
        const documento = await db.query(
          `SELECT 1 FROM convi.versiones_documento dv
           JOIN convi.documentos_institucionales d ON d.id = dv.documento_id
           WHERE dv.id = $1 AND d.estado = 'ACTIVO'
             AND d.tipo_documento <> 'PLANTILLA' AND dv.estado <> 'ARCHIVADO'`,
          [datos.version_documento_origen_id],
        );
        if (documento.rowCount === 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se guardó la versión.',
            errores: {
              version_documento_origen_id: 'Elige un documento de la lista.',
            },
          });
      }
      await db.query(
        `UPDATE convi.versiones_protocolo
         SET version_documento_origen_id = $2, notas = $3 WHERE id = $1`,
        [id, datos.version_documento_origen_id, datos.notas],
      );
      return { id };
    });
  }

  // HU-070 CA2 a CA4: los pasos se agregan y editan solo en Borrador. El
  // responsable previsto es siempre Convivencia (CA3).
  agregarPaso(sesion: Sesion, versionId: string, cuerpo: unknown) {
    const datos = validarPaso(cuerpo);
    return this.operar(sesion, async (db) => {
      await versionEnBorrador(db, versionId);
      const paso = await db
        .query<{ id: string }>(
          `INSERT INTO convi.pasos_protocolo
             (establecimiento_id, version_protocolo_id, orden_paso, nombre,
              descripcion, codigo_rol_responsable, valor_plazo, unidad_plazo,
              requiere_evidencia, es_obligatorio)
           VALUES (convi.establecimiento_actual(), $1, $2, $3, $4,
                   'CONVIVENCIA', $5, $6, $7, $8)
           RETURNING id`,
          [versionId, ...valoresPaso(datos)],
        )
        .catch(ordenRepetido);
      return { id: paso.rows[0].id, version_id: versionId };
    });
  }

  editarPaso(sesion: Sesion, pasoId: string, cuerpo: unknown) {
    const datos = validarPaso(cuerpo);
    return this.operar(sesion, async (db) => {
      const paso = await db.query<{ version_protocolo_id: string }>(
        'SELECT version_protocolo_id FROM convi.pasos_protocolo WHERE id = $1',
        [pasoId],
      );
      const versionId = paso.rows[0]?.version_protocolo_id;
      if (!versionId) throw new NotFoundException('El paso no existe.');
      await versionEnBorrador(db, versionId);
      await db
        .query(
          `UPDATE convi.pasos_protocolo
           SET orden_paso = $2, nombre = $3, descripcion = $4,
               valor_plazo = $5, unidad_plazo = $6,
               requiere_evidencia = $7, es_obligatorio = $8
           WHERE id = $1`,
          [pasoId, ...valoresPaso(datos)],
        )
        .catch(ordenRepetido);
      return { id: pasoId, version_id: versionId };
    });
  }

  // HU-072: publicar exige al menos un paso y el documento de origen; queda
  // quién la revisó y cuándo (CA1). La versión publicada antes queda
  // Archivada desde el día anterior, para que rija una sola a la vez; los
  // casos que ya la aplicaron la conservan (HU-071 CA4).
  publicar(sesion: Sesion, id: string, cuerpo: unknown) {
    const datos = validarPublicacion(cuerpo);
    return this.operar(sesion, async (db) => {
      const version = await versionEnBorrador(db, id);
      const errores: Record<string, string> = {};
      if (!version.version_documento_origen_id)
        errores.version_documento_origen_id =
          'Para publicar, indica el documento de origen en los datos de la versión.';
      const pasos = await db.query(
        'SELECT 1 FROM convi.pasos_protocolo WHERE version_protocolo_id = $1 LIMIT 1',
        [id],
      );
      if (pasos.rowCount === 0)
        errores.pasos = 'Agrega al menos un paso antes de publicar.';
      if (Object.keys(errores).length > 0)
        throw new BadRequestException({
          mensaje: 'Todavía no se puede publicar esta versión.',
          errores,
        });
      await db.query(
        `UPDATE convi.versiones_protocolo
         SET estado = 'ARCHIVADO',
             vigente_hasta = GREATEST(coalesce(vigente_desde, $2::date - 1),
                                      $2::date - 1)
         WHERE protocolo_id = $1 AND estado = 'PUBLICADO'`,
        [version.protocolo_id, datos.vigente_desde],
      );
      await db.query(
        `UPDATE convi.versiones_protocolo
         SET estado = 'PUBLICADO', revisado_por = convi.membresia_actual(),
             publicado_en = now(), vigente_desde = $2
         WHERE id = $1`,
        [id, datos.vigente_desde],
      );
      return { id, protocolo_id: version.protocolo_id };
    });
  }
}

function valoresPaso(datos: DatosPaso) {
  return [
    datos.orden_paso,
    datos.nombre,
    datos.descripcion,
    datos.valor_plazo,
    datos.unidad_plazo,
    datos.requiere_evidencia,
    datos.es_obligatorio,
  ];
}

function ordenRepetido(error: unknown): never {
  if (codigoError(error).code === '23505')
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se guardó el paso.',
      errores: { orden_paso: 'Ya hay un paso con ese orden en esta versión.' },
    });
  throw error;
}

/** Bloquea la versión y comprueba que siga en Borrador (HU-070 CA4, HU-072 CA3). */
async function versionEnBorrador(db: PoolClient, id: string) {
  const version = await db
    .query<{
      estado: string;
      protocolo_id: string;
      version_documento_origen_id: string | null;
    }>(
      `SELECT estado, protocolo_id, version_documento_origen_id
       FROM convi.versiones_protocolo WHERE id = $1 FOR UPDATE`,
      [id],
    )
    .catch((error: unknown) => {
      if (codigoError(error).code === '40001')
        throw new ConflictException(
          'Otra persona cambió esta versión mientras la editabas. Recarga la página.',
        );
      throw error;
    });
  const fila = version.rows[0];
  if (!fila) throw new NotFoundException(NO_EXISTE_VERSION);
  if (fila.estado !== 'BORRADOR') throw new ConflictException(SOLO_BORRADOR);
  return fila;
}
