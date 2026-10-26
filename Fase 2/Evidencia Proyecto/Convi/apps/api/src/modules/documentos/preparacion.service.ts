import {
  Inject,
  ForbiddenException,
  UnauthorizedException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { CuentaService } from '../../database/cuenta.service.js';
import type { Sesion } from '../../common/sesion.js';
import { validarArchivo } from '../situaciones/archivo-evidencia.js';
import { DocumentosService } from './documentos.service.js';
import type { TrabajoDocumento } from './cola.js';
import { COLA_DOCUMENTOS, type ColaDocumentos } from './cola.js';
import { aTiempo } from '../importaciones/cola.js';
import { configuracionEmbeddings, generarEmbeddings } from './embeddings.js';
import { extraerEnHilo } from './extractor.js';
import { ErrorPreparacion, MODELO_EMBEDDING } from './preparacion.js';

@Injectable()
export class PreparacionDocumentos {
  constructor(
    @Inject(CuentaService) private readonly cuentas: CuentaService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
    @Inject(COLA_DOCUMENTOS)
    private readonly cola: ColaDocumentos | null = null,
  ) {}

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['ADMIN', 'CONVIVENCIA'] },
      trabajo,
    );
  }

  async estado(sesion: Sesion, id: string) {
    const v = await this.documentos.version(sesion, id);
    const trabajo = this.cola
      ? await aTiempo(this.cola.getJobState(`version-${id}`), 1500).catch(
          () => 'unknown',
        )
      : 'unknown';
    return {
      estado_procesamiento: v.estado_procesamiento,
      intentos_procesamiento: v.intentos_procesamiento,
      detalle_error_procesamiento: v.detalle_error_procesamiento,
      en_curso: ['active', 'waiting', 'delayed', 'prioritized'].includes(
        trabajo,
      ),
    };
  }

  async solicitar(sesion: Sesion, id: string) {
    const version = await this.documentos.version(sesion, id);
    if (
      !version.incluir_en_busqueda_ia ||
      version.tipo_documento === 'PLANTILLA'
    )
      throw new ServiceUnavailableException(
        'Este documento no está habilitado para la búsqueda con IA',
      );
    if (version.estado_procesamiento !== 'LISTO') {
      try {
        configuracionEmbeddings();
      } catch (error) {
        throw new ServiceUnavailableException(
          error instanceof ErrorPreparacion
            ? error.message
            : 'La preparación no está disponible',
        );
      }
      await this.operar(sesion, (db) =>
        db.query(
          `UPDATE convi.versiones_documento
        SET estado_procesamiento = 'PENDIENTE', detalle_error_procesamiento = NULL
        WHERE id = $1 AND estado_procesamiento = 'FALLIDO'`,
          [id],
        ),
      );
      if (!(await this.documentos.programarPreparacion(sesion, id)))
        throw new ServiceUnavailableException(
          'No pudimos confirmar la solicitud de preparación, el original sigue disponible',
        );
    }
    return { id, documento_id: version.documento_id };
  }

  async procesar({ sesion, version_id: id }: TrabajoDocumento): Promise<void> {
    const inicio = await this.operar(sesion, async (db) => {
      const v = (
        await db.query<{
          estado_procesamiento: string;
          incluir_en_busqueda_ia: boolean;
          tipo_documento: string;
          estado_documento: string;
          sha256: string;
        }>(
          `SELECT v.estado_procesamiento, v.incluir_en_busqueda_ia,
          d.tipo_documento, d.estado AS estado_documento, a.sha256
        FROM convi.versiones_documento v
        JOIN convi.documentos_institucionales d ON d.id = v.documento_id
        JOIN convi.archivos a ON a.id = v.archivo_id
        WHERE v.id = $1 FOR UPDATE OF v`,
          [id],
        )
      ).rows[0];
      if (!v) throw new NotFoundException('Documento no disponible');
      if (
        !v.incluir_en_busqueda_ia ||
        v.tipo_documento === 'PLANTILLA' ||
        v.estado_documento !== 'ACTIVO' ||
        v.estado_procesamiento === 'LISTO'
      )
        return null;
      const intento = (
        await db.query<{ intentos_procesamiento: number }>(
          `UPDATE convi.versiones_documento SET estado_procesamiento = 'PROCESANDO',
          intentos_procesamiento = intentos_procesamiento + 1,
          detalle_error_procesamiento = NULL, procesado_en = NULL
        WHERE id = $1 RETURNING intentos_procesamiento`,
          [id],
        )
      ).rows[0].intentos_procesamiento;
      return { intento, sha256: v.sha256 };
    });
    if (!inicio) return;
    try {
      configuracionEmbeddings();
      const archivo = await this.documentos.descargar(sesion, id);
      const valido = validarArchivo({
        originalname: archivo.nombre,
        size: archivo.contenido.length,
        buffer: archivo.contenido,
      });
      if (
        'error' in valido ||
        !['pdf', 'docx'].includes(valido.formato) ||
        valido.mime !== archivo.mime ||
        createHash('sha256').update(archivo.contenido).digest('hex') !==
          inicio.sha256
      )
        throw new ErrorPreparacion(
          'El archivo no coincide con el original registrado o no tiene un formato válido',
        );
      const fragmentos = await extraerEnHilo(
        archivo.contenido,
        valido.formato as 'pdf' | 'docx',
      );
      const vectores = await generarEmbeddings(fragmentos);
      await this.operar(sesion, async (db) => {
        const v = (
          await db.query<{
            intentos_procesamiento: number;
            estado_procesamiento: string;
            incluir_en_busqueda_ia: boolean;
          }>(
            'SELECT intentos_procesamiento, estado_procesamiento, incluir_en_busqueda_ia FROM convi.versiones_documento WHERE id = $1 FOR UPDATE',
            [id],
          )
        ).rows[0];
        // Un trabajador recuperado puede terminar después de otro intento, no debe sobrescribirlo.
        if (
          !v ||
          v.intentos_procesamiento !== inicio.intento ||
          v.estado_procesamiento !== 'PROCESANDO' ||
          !v.incluir_en_busqueda_ia
        )
          return;
        const anteriores = (
          await db.query<{
            indice_fragmento: number;
            contenido: string;
            pagina_desde: number | null;
            pagina_hasta: number | null;
          }>(
            'SELECT indice_fragmento, contenido, pagina_desde, pagina_hasta FROM convi.fragmentos_rag WHERE version_documento_id = $1',
            [id],
          )
        ).rows;
        if (
          anteriores.some((a) => {
            const f = fragmentos[a.indice_fragmento];
            return (
              !f ||
              f.contenido !== a.contenido ||
              f.pagina_desde !== a.pagina_desde ||
              f.pagina_hasta !== a.pagina_hasta
            );
          })
        )
          throw new ErrorPreparacion(
            'Los fragmentos conservados no coinciden con esta lectura, registra una nueva versión del documento',
          );
        const registros = fragmentos.map((f, i) => ({
          indice_fragmento: f.indice,
          contenido: f.contenido,
          pagina_desde: f.pagina_desde,
          pagina_hasta: f.pagina_hasta,
          embedding: JSON.stringify(vectores[i]),
        }));
        await db.query(
          `INSERT INTO convi.fragmentos_rag
          (establecimiento_id, version_documento_id, indice_fragmento, contenido,
            pagina_desde, pagina_hasta, modelo_embedding, embedding)
          SELECT convi.establecimiento_actual(), $1, f.indice_fragmento, f.contenido,
            f.pagina_desde, f.pagina_hasta, $3, f.embedding
          FROM jsonb_populate_recordset(NULL::convi.fragmentos_rag, $2::jsonb) AS f
          ON CONFLICT (version_documento_id, indice_fragmento) DO UPDATE
            SET modelo_embedding = EXCLUDED.modelo_embedding, embedding = EXCLUDED.embedding`,
          [id, JSON.stringify(registros), MODELO_EMBEDDING],
        );
        await db.query(
          `UPDATE convi.versiones_documento SET estado_procesamiento = 'LISTO',
          procesado_en = now(), detalle_error_procesamiento = NULL WHERE id = $1`,
          [id],
        );
      });
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException
      )
        throw error;
      const seguro =
        error instanceof ErrorPreparacion
          ? error
          : new ErrorPreparacion(
              'No pudimos completar la preparación, el original sigue disponible y puedes volver a intentarlo',
              true,
            );
      // La misma cuenta debe seguir autorizada también al registrar el fallo.
      await this.operar(sesion, (db) =>
        db.query(
          `UPDATE convi.versiones_documento
        SET estado_procesamiento = 'FALLIDO', detalle_error_procesamiento = $3
        WHERE id = $1 AND intentos_procesamiento = $2 AND estado_procesamiento = 'PROCESANDO'`,
          [id, inicio.intento, seguro.message],
        ),
      ).catch(() => {});
      throw seguro;
    }
  }
}
