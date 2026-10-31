import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import {
  CuentaService,
  type AccesoRegistro,
} from '../../database/cuenta.service.js';
import type { ArchivoSubido } from '../situaciones/archivo-evidencia.js';
import { usaBusquedaIa, validarCarga, validarVigencia } from './documento.js';
import {
  COLA_DOCUMENTOS,
  encolarDocumento,
  type ColaDocumentos,
} from './cola.js';

export const DOCUMENTOS_STORAGE = Symbol('DOCUMENTOS_STORAGE');
const ESPACIO = 'convi-privado';
const PERFILES = ['ADMIN', 'CONVIVENCIA'] as const;
const ACCESO: AccesoRegistro = { tipo: 'establecimiento', perfiles: PERFILES };
const NO_EXISTE = 'El documento no existe o no tienes permiso para consultarlo';
const VERSION = `v.id, v.documento_id, v.etiqueta_version, v.estado,
  v.vigente_desde::text, v.vigente_hasta::text, v.publicado_en,
  v.incluir_en_busqueda_ia, v.estado_procesamiento, v.intentos_procesamiento,
  v.detalle_error_procesamiento, a.nombre_original, a.tipo_mime, a.tamano_bytes::int, a.subido_en,
  p.nombres || ' ' || p.apellidos AS subido_por,
  (v.estado = 'PUBLICADO' AND d.estado = 'ACTIVO' AND v.vigente_desde <= current_date
    AND (v.vigente_hasta IS NULL OR v.vigente_hasta >= current_date)) AS vigente`;
const DESDE_VERSION = `FROM convi.versiones_documento v
  JOIN convi.documentos_institucionales d ON d.id = v.documento_id
  JOIN convi.archivos a ON a.id = v.archivo_id
  JOIN convi.membresias_establecimiento m ON m.id = v.subido_por
  JOIN convi.personas p ON p.id = m.persona_id`;

// Un choque con otra operación al mismo tiempo se informa como conflicto para que la pantalla pida recargar.
function conConflicto<T>(trabajo: (db: PoolClient) => Promise<T>) {
  return async (db: PoolClient) => {
    try {
      return await trabajo(db);
    } catch (error) {
      if (['40001', '40P01'].includes((error as { code?: string }).code ?? ''))
        throw new ConflictException(
          'El documento cambió mientras trabajabas, recarga la página',
        );
      throw error;
    }
  };
}

// El original se conserva incluso si no se consigue encolar su preparación.
@Injectable()
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);
  constructor(
    @Inject(CuentaService) private readonly cuentas: CuentaService,
    @Inject(DOCUMENTOS_STORAGE) private readonly supabase: SupabaseClient,
    @Inject(COLA_DOCUMENTOS)
    private readonly cola: ColaDocumentos | null = null,
  ) {}

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(sesion, ACCESO, conConflicto(trabajo));
  }

  /**
   * Altas de documentos y versiones: esperan su turno con bloquearCatalogo y van en
   * READ COMMITTED, así la revisión de etiquetas ve lo que otra carga guardó mientras
   * esta esperaba y dos cargas a la vez se guardan una después de la otra.
   */
  private operarCatalogo<T>(
    sesion: Sesion,
    trabajo: (db: PoolClient) => Promise<T>,
  ) {
    return this.cuentas.operar(
      sesion,
      ACCESO,
      conConflicto(async (db) => {
        await this.bloquearCatalogo(db);
        return trabajo(db);
      }),
      'READ COMMITTED',
    );
  }

  async programarPreparacion(sesion: Sesion, id: string): Promise<boolean> {
    try {
      const version = await this.version(sesion, id);
      if (
        !version.incluir_en_busqueda_ia ||
        version.estado_procesamiento === 'LISTO'
      )
        return true;
      await encolarDocumento(this.cola, sesion, id);
      return true;
    } catch {
      await this.operar(sesion, (db) =>
        db.query(
          `UPDATE convi.versiones_documento
        SET estado_procesamiento = 'FALLIDO', detalle_error_procesamiento = $2
        WHERE id = $1 AND incluir_en_busqueda_ia AND estado_procesamiento = 'PENDIENTE'`,
          [
            id,
            'No pudimos confirmar la solicitud de preparación, el original se guardó y puedes volver a solicitarla',
          ],
        ),
      ).catch(() =>
        this.logger.warn(
          'No se pudo registrar el estado de una solicitud de preparación',
        ),
      );
      return false;
    }
  }

  listar(sesion: Sesion) {
    return this.operar(
      sesion,
      async (db) =>
        (
          await db.query(`SELECT d.id, d.tipo_documento, d.titulo, d.estado,
      count(v.id)::int AS versiones,
      max(v.publicado_en) AS ultima_publicacion,
      bool_or(d.estado = 'ACTIVO' AND v.estado = 'PUBLICADO' AND v.vigente_desde <= current_date
        AND (v.vigente_hasta IS NULL OR v.vigente_hasta >= current_date)) AS vigente
      FROM convi.documentos_institucionales d
      LEFT JOIN convi.versiones_documento v ON v.documento_id = d.id
      GROUP BY d.id ORDER BY d.titulo, d.id`)
        ).rows,
    );
  }

  detalle(sesion: Sesion, id: string) {
    return this.operar(sesion, async (db) => {
      const doc = (
        await db.query(
          'SELECT id, titulo, tipo_documento, estado FROM convi.documentos_institucionales WHERE id = $1',
          [id],
        )
      ).rows[0];
      if (!doc) throw new NotFoundException(NO_EXISTE);
      const versiones = (
        await db.query(
          `SELECT ${VERSION} ${DESDE_VERSION} WHERE v.documento_id = $1 ORDER BY coalesce(v.publicado_en, a.subido_en) DESC, v.id`,
          [id],
        )
      ).rows;
      const hoy = (
        await db.query<{ hoy: string }>('SELECT current_date::text AS hoy')
      ).rows[0].hoy;
      return { ...doc, versiones, hoy };
    });
  }

  version(sesion: Sesion, id: string) {
    return this.operar(sesion, async (db) => {
      const v = (
        await db.query(
          `SELECT ${VERSION}, d.titulo, d.tipo_documento ${DESDE_VERSION} WHERE v.id = $1`,
          [id],
        )
      ).rows[0];
      if (!v) throw new NotFoundException(NO_EXISTE);
      return v;
    });
  }

  async cargar(
    sesion: Sesion,
    cuerpo: unknown,
    archivo: ArchivoSubido | undefined,
    documentoId?: string,
  ) {
    const datos = validarCarga(cuerpo, archivo, !documentoId);
    const clave = `${sesion.establecimiento_id}/documentos/${randomUUID()}.${datos.archivo.formato}`;
    let subido = false;
    try {
      const guardado = await this.operarCatalogo(sesion, async (db) => {
        let doc: {
          id: string;
          titulo: string;
          tipo_documento: string;
          estado: string;
        };
        if (documentoId) {
          doc = await this.bloquearDocumento(db, documentoId);
          if (doc.estado !== 'ACTIVO')
            throw new ConflictException('El documento está inactivo');
        } else {
          doc = (
            await db.query(
              `INSERT INTO convi.documentos_institucionales (establecimiento_id, tipo_documento, titulo)
            VALUES (convi.establecimiento_actual(), $1, $2) RETURNING id, titulo, tipo_documento, estado`,
              [datos.tipo, datos.titulo],
            )
          ).rows[0];
        }
        await this.comprobarEtiqueta(db, doc.titulo, datos.etiqueta);
        const ar = (
          await db.query(
            `INSERT INTO convi.archivos
          (establecimiento_id, clave_almacenamiento, nombre_original, tipo_mime, tamano_bytes, sha256, subido_por)
          VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5, convi.membresia_actual()) RETURNING id`,
            [
              clave,
              datos.archivo.nombre,
              datos.archivo.mime,
              datos.archivo.tamano,
              datos.archivo.sha256,
            ],
          )
        ).rows[0];
        const v = await db
          .query(
            `INSERT INTO convi.versiones_documento
          (establecimiento_id, documento_id, etiqueta_version, archivo_id, subido_por, incluir_en_busqueda_ia, estado_procesamiento)
          VALUES (convi.establecimiento_actual(), $1, $2, $3, convi.membresia_actual(), $4, $5) RETURNING id`,
            [
              doc.id,
              datos.etiqueta,
              ar.id,
              usaBusquedaIa(doc.tipo_documento),
              usaBusquedaIa(doc.tipo_documento) ? 'PENDIENTE' : 'NO_APLICA',
            ],
          )
          .catch((e: unknown) => {
            if ((e as { code?: string }).code === '23505')
              throw new BadRequestException({
                mensaje: 'No se guardó la versión',
                errores: {
                  etiqueta_version:
                    'Este documento ya tiene una versión con esa etiqueta',
                },
              });
            throw e;
          });
        const { error } = await this.supabase.storage
          .from(ESPACIO)
          .upload(clave, archivo!.buffer, {
            contentType: datos.archivo.mime,
            upsert: false,
          });
        if (error)
          throw new ServiceUnavailableException(
            'No pudimos guardar el archivo, inténtalo nuevamente',
          );
        subido = true;
        return { id: doc.id, version_id: v.rows[0].id };
      });
      const preparacion_solicitada = await this.programarPreparacion(
        sesion,
        guardado.version_id,
      );
      return { ...guardado, preparacion_solicitada };
    } catch (e) {
      // Un COMMIT sin respuesta puede haber guardado el registro, comprobar antes de retirar el objeto.
      if (subido) {
        try {
          const existe = await this.operar(
            sesion,
            async (db) =>
              (
                await db.query(
                  'SELECT 1 FROM convi.archivos WHERE clave_almacenamiento = $1',
                  [clave],
                )
              ).rows.length > 0,
          );
          if (!existe) {
            const { error } = await this.supabase.storage
              .from(ESPACIO)
              .remove([clave]);
            if (error) throw error;
          }
        } catch {
          this.logger.error('No se pudo conciliar una carga de documento');
        }
      }
      throw e;
    }
  }

  private async bloquearDocumento(db: PoolClient, id: string) {
    // En REPEATABLE READ, escribir el padre detecta publicaciones simultáneas aunque cambien versiones distintas.
    const doc = (
      await db.query<{
        id: string;
        titulo: string;
        tipo_documento: string;
        estado: string;
      }>(
        'UPDATE convi.documentos_institucionales SET estado = estado WHERE id = $1 RETURNING id, titulo, tipo_documento, estado',
        [id],
      )
    ).rows[0];
    if (!doc) throw new NotFoundException(NO_EXISTE);
    return doc;
  }

  private async bloquearCatalogo(db: PoolClient) {
    // Ordena las altas de la escuela sin tocar datos ni agregar un índice, con un bloqueo
    // que dura hasta el COMMIT. No se usa la fila de la escuela porque toda operación la
    // bloquea al revisar la cuenta (CuentaService.operar), y actualizarla hacía fallar con
    // un conflicto lo que corría al mismo tiempo, también la preparación de documentos.
    await db.query(
      `SELECT pg_advisory_xact_lock(hashtext('convi_documentos'), hashtext(convi.establecimiento_actual()::text))`,
    );
  }

  private async comprobarEtiqueta(
    db: PoolClient,
    titulo: string,
    etiqueta: string,
  ) {
    const repetida = (
      await db.query<{
        titulo: string;
        etiqueta_version: string;
        creado: string;
      }>(
        `
      SELECT d.titulo, v.etiqueta_version,
        to_char((SELECT min(a.subido_en) FROM convi.versiones_documento origen
          JOIN convi.archivos a ON a.id = origen.archivo_id WHERE origen.documento_id = d.id), 'DD-MM-YYYY HH24:MI') AS creado
      FROM convi.documentos_institucionales d JOIN convi.versiones_documento v ON v.documento_id = d.id
      WHERE lower(regexp_replace(trim(d.titulo), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(trim($1::text), '[[:space:]]+', ' ', 'g'))
        AND lower(regexp_replace(trim(v.etiqueta_version), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(trim($2::text), '[[:space:]]+', ' ', 'g'))
      LIMIT 1`,
        [titulo, etiqueta],
      )
    ).rows[0];
    if (repetida)
      throw new BadRequestException({
        mensaje:
          'No se pudo guardar porque ese documento ya tiene esta etiqueta',
        errores: {
          etiqueta_version: `Ya existe «${repetida.titulo}» con la etiqueta «${repetida.etiqueta_version}», el documento fue incorporado el ${repetida.creado}`,
        },
      });
  }

  private async bloquearVersion(db: PoolClient, id: string) {
    const dato = (
      await db.query<{ documento_id: string }>(
        'SELECT documento_id FROM convi.versiones_documento WHERE id = $1',
        [id],
      )
    ).rows[0];
    if (!dato) throw new NotFoundException(NO_EXISTE);
    const doc = await this.bloquearDocumento(db, dato.documento_id);
    const v = (
      await db.query<{
        id: string;
        documento_id: string;
        estado: string;
        vigente_desde: string | null;
        vigente_hasta: string | null;
        titulo: string;
        etiqueta_version: string;
        archivo_id: string;
        incluir_en_busqueda_ia: boolean;
        tipo_documento: string;
      }>(
        `SELECT v.id, v.documento_id, v.estado, v.vigente_desde::text, v.vigente_hasta::text,
           d.titulo, v.etiqueta_version, v.archivo_id, v.incluir_en_busqueda_ia, d.tipo_documento
         FROM convi.versiones_documento v JOIN convi.documentos_institucionales d ON d.id = v.documento_id WHERE v.id = $1 FOR UPDATE OF v`,
        [id],
      )
    ).rows[0];
    return { ...v, documento_activo: doc.estado === 'ACTIVO' };
  }

  publicar(sesion: Sesion, id: string, cuerpo: unknown) {
    const datos = validarVigencia(cuerpo);
    return this.operar(sesion, async (db) => {
      const v = await this.bloquearVersion(db, id);
      if (v.estado !== 'BORRADOR')
        throw new ConflictException('Solo se publican versiones en borrador');
      if (!v.documento_activo)
        throw new ConflictException('El documento está inactivo');
      const solapada =
        (
          await db.query(
            `SELECT 1 FROM convi.versiones_documento WHERE documento_id = $1 AND estado = 'PUBLICADO'
        AND vigente_desde <= coalesce($3::date, 'infinity'::date)
        AND coalesce(vigente_hasta, 'infinity'::date) >= $2::date`,
            [v.documento_id, datos.desde, datos.hasta],
          )
        ).rows.length > 0;
      if (solapada)
        throw new ConflictException(
          'Las fechas coinciden con otra versión publicada de este documento, cierra primero su vigencia o elige otro período',
        );
      await db.query(
        "UPDATE convi.versiones_documento SET estado = 'PUBLICADO', publicado_en = now(), vigente_desde = $2, vigente_hasta = $3 WHERE id = $1",
        [id, datos.desde, datos.hasta],
      );
      return { id, documento_id: v.documento_id };
    });
  }

  cerrarVigencia(sesion: Sesion, id: string, cuerpo: unknown) {
    const { hasta } = validarVigencia(cuerpo, true);
    return this.operar(sesion, async (db) => {
      const v = await this.bloquearVersion(db, id);
      if (v.estado !== 'PUBLICADO')
        throw new ConflictException(
          'Solo se cierra la vigencia de una versión publicada',
        );
      if (v.vigente_hasta)
        throw new ConflictException(
          'Este documento ya tiene una fecha de término definida',
        );
      if (
        hasta! < v.vigente_desde! ||
        (v.vigente_hasta && hasta! > v.vigente_hasta)
      )
        throw new BadRequestException({
          mensaje: 'Revisa la fecha de término',
          errores: {
            vigente_hasta:
              'Debe estar entre el inicio y el término vigente, si ya existe',
          },
        });
      await db.query(
        'UPDATE convi.versiones_documento SET vigente_hasta = $2 WHERE id = $1',
        [id, hasta],
      );
      return { id, documento_id: v.documento_id };
    });
  }

  archivar(sesion: Sesion, id: string) {
    return this.operar(sesion, async (db) => {
      const v = await this.bloquearVersion(db, id);
      if (v.estado !== 'PUBLICADO')
        throw new ConflictException('Solo se archivan versiones publicadas');
      await db.query(
        "UPDATE convi.versiones_documento SET estado = 'ARCHIVADO' WHERE id = $1",
        [id],
      );
      return { id, documento_id: v.documento_id };
    });
  }

  async republicar(sesion: Sesion, id: string, cuerpo: unknown) {
    const datos = validarVigencia(cuerpo);
    const guardado = await this.operarCatalogo(sesion, async (db) => {
      const v = await this.bloquearVersion(db, id);
      if (v.estado !== 'ARCHIVADO' || !v.documento_activo)
        throw new ConflictException(
          'Solo se publican nuevamente documentos archivados de un documento activo',
        );
      const hoy = (
        await db.query<{ hoy: string }>('SELECT current_date::text AS hoy')
      ).rows[0].hoy;
      if (datos.desde !== hoy)
        throw new ConflictException(
          'Recarga la página para publicar desde la fecha actual de tu escuela',
        );
      return this.publicarCopia(db, v, {
        sufijo: (n) => ` · republicación ${n}`,
        desde: hoy,
        hasta: datos.hasta,
        archivar: 'documento',
        accion: 'REPUBLICACION_DOCUMENTO',
      });
    });
    const preparacion_solicitada = await this.programarPreparacion(
      sesion,
      guardado.id,
    );
    return { ...guardado, preparacion_solicitada };
  }

  /**
   * PB-079, decisión del PO (2026-10-30): una versión que no está habilitada para la
   * búsqueda con IA se habilita sin volver a subir el archivo. En borrador se marca y
   * listo, pero una versión publicada no cambia (proteger_version), así que se publica
   * de nuevo el mismo archivo con las mismas fechas, ya habilitado, y la anterior queda
   * archivada. Las plantillas no se habilitan.
   */
  async habilitarBusqueda(sesion: Sesion, id: string) {
    const guardado = await this.operarCatalogo(sesion, async (db) => {
      const v = await this.bloquearVersion(db, id);
      if (v.incluir_en_busqueda_ia)
        return { id: v.id, documento_id: v.documento_id };
      if (!usaBusquedaIa(v.tipo_documento))
        throw new ConflictException(
          'Las plantillas se conservan para descarga, no se usan en la búsqueda con IA',
        );
      if (!v.documento_activo)
        throw new ConflictException('El documento está inactivo');
      if (v.estado === 'BORRADOR') {
        await db.query(
          `UPDATE convi.versiones_documento
           SET incluir_en_busqueda_ia = true, estado_procesamiento = 'PENDIENTE'
           WHERE id = $1`,
          [id],
        );
        return { id: v.id, documento_id: v.documento_id };
      }
      if (v.estado !== 'PUBLICADO') {
        // Un segundo clic llega cuando esta ya quedó archivada: responde la versión
        // que creó el primero, sin publicar otra.
        const creada = (
          await db.query<{ recurso_id: string }>(
            `SELECT recurso_id FROM convi.eventos_auditoria
             WHERE codigo_accion = 'HABILITACION_BUSQUEDA_IA'
               AND metadatos->>'version_origen_id' = $1::text
             ORDER BY ocurrido_en DESC LIMIT 1`,
            [v.id],
          )
        ).rows[0];
        if (creada)
          return { id: creada.recurso_id, documento_id: v.documento_id };
        throw new ConflictException(
          'Esta versión está archivada, publícala nuevamente y quedará habilitada para la búsqueda con IA',
        );
      }
      return this.publicarCopia(db, v, {
        sufijo: (n) => (n === 1 ? ' · con IA' : ` · con IA ${n}`),
        desde: v.vigente_desde,
        hasta: v.vigente_hasta,
        archivar: 'version',
        accion: 'HABILITACION_BUSQUEDA_IA',
      });
    });
    const preparacion_solicitada = await this.programarPreparacion(
      sesion,
      guardado.id,
    );
    return { ...guardado, preparacion_solicitada };
  }

  /**
   * Publica otra versión con el mismo archivo y una etiqueta libre, archiva la
   * anterior y deja el evento de auditoría. Queda habilitada para la búsqueda con IA
   * si el documento no es una plantilla.
   */
  private async publicarCopia(
    db: PoolClient,
    v: Awaited<ReturnType<DocumentosService['bloquearVersion']>>,
    opciones: {
      sufijo: (numero: number) => string;
      desde: string | null;
      hasta: string | null;
      archivar: 'documento' | 'version';
      accion: 'REPUBLICACION_DOCUMENTO' | 'HABILITACION_BUSQUEDA_IA';
    },
  ) {
    const etiquetas = (
      await db.query<{ etiqueta_version: string }>(
        `SELECT v.etiqueta_version FROM convi.versiones_documento v
        JOIN convi.documentos_institucionales d ON d.id = v.documento_id
        WHERE lower(regexp_replace(trim(d.titulo), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(trim($1::text), '[[:space:]]+', ' ', 'g'))`,
        [v.titulo],
      )
    ).rows;
    const usadas = new Set(
      etiquetas.map((x) =>
        x.etiqueta_version.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es'),
      ),
    );
    let numero = 1,
      etiqueta: string;
    do {
      const sufijo = opciones.sufijo(numero++);
      etiqueta = v.etiqueta_version.slice(0, 60 - sufijo.length) + sufijo;
    } while (usadas.has(etiqueta.toLocaleLowerCase('es')));
    // Al republicar se archiva la publicada del documento, al habilitar solo esta versión.
    await db.query(
      opciones.archivar === 'documento'
        ? "UPDATE convi.versiones_documento SET estado = 'ARCHIVADO' WHERE documento_id = $1 AND estado = 'PUBLICADO'"
        : "UPDATE convi.versiones_documento SET estado = 'ARCHIVADO' WHERE id = $1 AND estado = 'PUBLICADO'",
      [opciones.archivar === 'documento' ? v.documento_id : v.id],
    );
    const incluir = v.incluir_en_busqueda_ia || usaBusquedaIa(v.tipo_documento);
    const nueva = (
      await db.query<{ id: string }>(
        `INSERT INTO convi.versiones_documento
        (establecimiento_id, documento_id, etiqueta_version, archivo_id, subido_por, estado, publicado_en,
         vigente_desde, vigente_hasta, incluir_en_busqueda_ia, estado_procesamiento)
        VALUES (convi.establecimiento_actual(), $1, $2, $3, convi.membresia_actual(), 'PUBLICADO', now(), $4, $5, $6, $7) RETURNING id`,
        [
          v.documento_id,
          etiqueta,
          v.archivo_id,
          opciones.desde,
          opciones.hasta,
          incluir,
          incluir ? 'PENDIENTE' : 'NO_APLICA',
        ],
      )
    ).rows[0];
    await db.query(
      `INSERT INTO convi.eventos_auditoria
        (establecimiento_id, membresia_actor_id, codigo_accion, tipo_recurso, recurso_id, codigo_resultado, metadatos)
        VALUES (convi.establecimiento_actual(), convi.membresia_actual(), $3, 'versiones_documento', $1, 'OK', jsonb_build_object('version_origen_id', $2::text))`,
      [nueva.id, v.id, opciones.accion],
    );
    return { id: nueva.id, documento_id: v.documento_id };
  }

  async descargar(sesion: Sesion, id: string) {
    const a = await this.operar(sesion, async (db) => {
      const ar = (
        await db.query<{
          nombre_original: string;
          tipo_mime: string;
          bucket_id: string;
          clave_almacenamiento: string;
        }>(
          `SELECT a.nombre_original, a.tipo_mime, a.bucket_id, a.clave_almacenamiento
        FROM convi.versiones_documento v JOIN convi.archivos a ON a.id = v.archivo_id WHERE v.id = $1`,
          [id],
        )
      ).rows[0];
      if (!ar) throw new NotFoundException(NO_EXISTE);
      return ar;
    });
    if (
      a.bucket_id !== ESPACIO ||
      !a.clave_almacenamiento.startsWith(`${sesion.establecimiento_id}/`) ||
      /[%\\]/.test(a.clave_almacenamiento) ||
      a.clave_almacenamiento
        .split('/')
        .some((p) => !p || p === '.' || p === '..')
    )
      throw new NotFoundException(NO_EXISTE);
    const { data, error } = await this.supabase.storage
      .from(ESPACIO)
      .download(a.clave_almacenamiento);
    if (error || !data)
      throw new ServiceUnavailableException(
        'No pudimos leer el archivo, inténtalo nuevamente',
      );
    return {
      nombre: a.nombre_original,
      mime: a.tipo_mime,
      contenido: Buffer.from(await data.arrayBuffer()),
    };
  }
}
