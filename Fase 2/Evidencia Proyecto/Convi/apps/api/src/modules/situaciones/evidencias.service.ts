import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { comprobarCasoHijo } from './portal-apoderado.js';
import {
  validarEvidencia,
  type ArchivoSubido,
  type NuevaEvidencia,
} from './archivo-evidencia.js';

// PB-066 (HU-057): evidencias de situaciones y casos. El profesor adjunta a
// las situaciones que registró y Convivencia a cualquier situación o caso de
// su escuela. Cada evidencia se liga a un solo origen (CA1) y no se edita ni
// se borra (CA4: la base lo impide; corregir es PB-073). El archivo queda en
// el espacio privado convi-privado, que solo lee la API con su clave de
// servicio, y cada descarga vuelve a comprobar el permiso (CA3). Las
// actuaciones y los compromisos se agregan cuando existan sus pantallas.

/** Cliente de Supabase con la clave de servicio, solo para Storage. */
export const ALMACENAMIENTO = Symbol('ALMACENAMIENTO');
const ESPACIO = 'convi-privado';

/** Evidencia ya adjuntada, para mostrarla en un detalle. */
export type EvidenciaRegistrada = {
  id: string;
  titulo: string;
  tipo: string;
  descripcion: string | null;
  /** Nombre original del archivo. */
  archivo: string | null;
  tamano_bytes: number | null;
  creado_por: string;
  creado_en: Date;
  /** Dónde está ligada, por ejemplo "Caso" o "Situación SIT-2026-00010". */
  origen: string;
};

const COLUMNAS_EVIDENCIA = `
  ev.id, ev.titulo, ev.tipo_evidencia AS tipo, ev.descripcion,
  ar.nombre_original AS archivo, ar.tamano_bytes::int AS tamano_bytes,
  p.nombres || ' ' || p.apellidos AS creado_por, ev.creado_en`;

const UNIONES_EVIDENCIA = `
  LEFT JOIN convi.archivos ar ON ar.id = ev.archivo_id
  JOIN convi.membresias_establecimiento m ON m.id = ev.creado_por
  JOIN convi.personas p ON p.id = m.persona_id`;

/** Evidencias de la situación y de las respuestas a sus aclaraciones. */
export async function evidenciasDeSituacion(
  db: PoolClient,
  situacionId: string,
): Promise<EvidenciaRegistrada[]> {
  const evidencias = await db.query<EvidenciaRegistrada>(
    `SELECT ${COLUMNAS_EVIDENCIA},
            CASE WHEN ev.aclaracion_id IS NULL THEN 'Situación'
                 ELSE 'Respuesta a una aclaración' END AS origen
     FROM convi.evidencias ev ${UNIONES_EVIDENCIA}
     WHERE ev.situacion_id = $1
        OR ev.aclaracion_id IN (SELECT a.id FROM convi.aclaraciones_situacion a
                                WHERE a.situacion_id = $1)
     ORDER BY ev.creado_en, ev.id`,
    [situacionId],
  );
  return evidencias.rows;
}

/**
 * Evidencias del expediente del caso: las del caso y las de sus situaciones
 * vinculadas, actuaciones y compromisos (vw_evidencias_contexto).
 */
export async function evidenciasDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<EvidenciaRegistrada[]> {
  const evidencias = await db.query<EvidenciaRegistrada>(
    `SELECT ${COLUMNAS_EVIDENCIA},
            CASE WHEN ev.caso_id IS NOT NULL THEN 'Caso'
                 WHEN ev.situacion_id IS NOT NULL THEN 'Situación ' || s.codigo
                 WHEN ev.aclaracion_id IS NOT NULL THEN 'Aclaración de ' || sa.codigo
                 WHEN ev.actuacion_id IS NOT NULL THEN 'Actuación'
                 WHEN ev.compromiso_id IS NOT NULL THEN 'Compromiso'
                 ELSE 'Caso' END AS origen
     FROM convi.vw_evidencias_contexto ev ${UNIONES_EVIDENCIA}
     LEFT JOIN convi.situaciones s ON s.id = ev.situacion_id
     LEFT JOIN convi.aclaraciones_situacion ac ON ac.id = ev.aclaracion_id
     LEFT JOIN convi.situaciones sa ON sa.id = ac.situacion_id
     WHERE ev.caso_contexto_id = $1
     ORDER BY ev.creado_en, ev.id`,
    [casoId],
  );
  return evidencias.rows;
}

type Origen = { columna: 'situacion_id' | 'caso_id'; id: string };

@Injectable()
export class EvidenciasService {
  private readonly logger = new Logger(EvidenciasService.name);

  constructor(
    @Inject(CuentaService) private readonly cuentas: CuentaService,
    @Inject(ALMACENAMIENTO) private readonly supabase: SupabaseClient,
  ) {}

  // El profesor solo adjunta a las situaciones que registró; si es de otra
  // persona se responde igual que si no existiera (como su detalle, PB-041).
  adjuntarProfesor(
    sesion: Sesion,
    situacionId: string,
    cuerpo: unknown,
    archivo: ArchivoSubido | undefined,
  ) {
    const datos = validarEvidencia(cuerpo, archivo);
    return this.guardar(sesion, ['PROFESOR'], datos, archivo!, async (db) => {
      const propia = await db.query(
        `SELECT 1 FROM convi.situaciones
         WHERE id = $1 AND reportado_por_membresia_id = convi.membresia_actual()`,
        [situacionId],
      );
      if (propia.rowCount === 0)
        throw new ForbiddenException('No tienes permiso para este registro.');
      return { columna: 'situacion_id', id: situacionId };
    });
  }

  // Convivencia adjunta a cualquier situación de su escuela, en cualquier estado.
  adjuntarASituacion(
    sesion: Sesion,
    situacionId: string,
    cuerpo: unknown,
    archivo: ArchivoSubido | undefined,
  ) {
    const datos = validarEvidencia(cuerpo, archivo);
    return this.guardar(
      sesion,
      ['CONVIVENCIA'],
      datos,
      archivo!,
      async (db) => {
        const existe = await db.query(
          'SELECT 1 FROM convi.situaciones WHERE id = $1',
          [situacionId],
        );
        if (existe.rowCount === 0)
          throw new NotFoundException('La situación no existe.');
        return { columna: 'situacion_id', id: situacionId };
      },
    );
  }

  // Decisión del PO (por defecto): un caso cerrado conserva sus evidencias
  // pero no recibe nuevas; para agregarlas hay que reabrirlo (PB-058).
  adjuntarACaso(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
    archivo: ArchivoSubido | undefined,
  ) {
    const datos = validarEvidencia(cuerpo, archivo);
    return this.guardar(
      sesion,
      ['CONVIVENCIA'],
      datos,
      archivo!,
      async (db) => {
        // FOR SHARE impide que el caso se cierre mientras se adjunta.
        const caso = await db
          .query<{ estado_actual: string }>(
            'SELECT estado_actual FROM convi.casos WHERE id = $1 FOR SHARE',
            [casoId],
          )
          .catch((error: unknown) => {
            if ((error as { code?: string }).code === '40001')
              throw new ConflictException(
                'El caso cambió mientras adjuntabas. Recarga la página e inténtalo nuevamente.',
              );
            throw error;
          });
        if (!caso.rows[0]) throw new NotFoundException('El caso no existe.');
        if (caso.rows[0].estado_actual === 'CERRADO')
          throw new ConflictException(
            'El caso está cerrado: conserva sus evidencias, pero no recibe nuevas.',
          );
        return { columna: 'caso_id', id: casoId };
      },
    );
  }

  /**
   * CA3: cada descarga pasa por el servidor, que vuelve a comprobar la
   * sesión, la cuenta activa, la escuela y el perfil (CuentaService.operar).
   * El profesor solo descarga lo que él aportó a sus propias situaciones.
   */
  async descargar(
    sesion: Sesion,
    perfil: 'PROFESOR' | 'CONVIVENCIA',
    evidenciaId: string,
  ): Promise<{ nombre: string; mime: string; contenido: Buffer }> {
    const soloPropias = `
       AND ev.creado_por = convi.membresia_actual()
       AND (ev.situacion_id IN (SELECT s.id FROM convi.situaciones s
              WHERE s.reportado_por_membresia_id = convi.membresia_actual())
         OR ev.aclaracion_id IN (SELECT a.id FROM convi.aclaraciones_situacion a
              WHERE a.profesor_destinatario_id = convi.membresia_actual()))`;
    const archivo = await this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: [perfil] },
      async (db) => {
        const fila = await db.query<{
          nombre: string;
          mime: string;
          clave: string;
          espacio: string;
        }>(
          `SELECT ar.nombre_original AS nombre, ar.tipo_mime AS mime,
                  ar.clave_almacenamiento AS clave, ar.bucket_id AS espacio
           FROM convi.evidencias ev
           JOIN convi.archivos ar ON ar.id = ev.archivo_id
           WHERE ev.id = $1 ${perfil === 'PROFESOR' ? soloPropias : ''}`,
          [evidenciaId],
        );
        // Sin permiso se responde igual que si no existiera.
        if (!fila.rows[0])
          throw new NotFoundException(
            'La evidencia no existe o no tienes permiso para descargarla.',
          );
        return fila.rows[0];
      },
    );
    return this.leerArchivo(sesion, archivo);
  }

  descargarApoderado(
    sesion: Sesion,
    estudianteId: string,
    casoId: string,
    evidenciaId: string,
  ) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'caso', id: casoId, estudianteId, perfiles: ['APODERADO'] },
      async (db) => {
        await comprobarCasoHijo(db, estudianteId, casoId);
        const { rows } = await db.query<{
          nombre: string;
          mime: string;
          clave: string;
          espacio: string;
        }>(
          `SELECT ar.nombre_original AS nombre,ar.tipo_mime AS mime,ar.clave_almacenamiento AS clave,ar.bucket_id AS espacio
         FROM convi.vw_evidencias_contexto ev JOIN convi.archivos ar ON ar.id=ev.archivo_id
         WHERE ev.id=$1 AND ev.caso_contexto_id=$2`,
          [evidenciaId, casoId],
        );
        if (!rows[0])
          throw new NotFoundException(
            'La evidencia no existe o no tienes permiso para descargarla',
          );
        // La cuenta y el vínculo se comprueban en cada descarga, sin emitir URLs reutilizables.
        return this.leerArchivo(sesion, rows[0]);
      },
    );
  }

  private async leerArchivo(
    sesion: Sesion,
    archivo: { nombre: string; mime: string; clave: string; espacio: string },
  ) {
    // PB-143: la credencial de Storage no debe leer fuera del espacio de esta escuela.
    if (
      archivo.espacio !== ESPACIO ||
      !archivo.clave.startsWith(`${sesion.establecimiento_id}/`) ||
      /[%\\]/.test(archivo.clave) ||
      archivo.clave
        .split('/')
        .some((parte) => !parte || parte === '.' || parte === '..')
    )
      throw new NotFoundException(
        'La evidencia no existe o no tienes permiso para descargarla.',
      );
    const { data, error } = await this.supabase.storage
      .from(ESPACIO)
      .download(archivo.clave);
    if (error || !data)
      throw new ServiceUnavailableException(
        'No pudimos leer el archivo. Inténtalo de nuevo en unos minutos.',
      );
    return {
      nombre: archivo.nombre,
      mime: archivo.mime,
      contenido: Buffer.from(await data.arrayBuffer()),
    };
  }

  // Guarda el archivo y la evidencia en una sola transacción (PB-138); al
  // final sube el archivo al espacio privado, de modo que si Storage falla la
  // base deshace todo y no queda una evidencia sin archivo.
  private async guardar(
    sesion: Sesion,
    perfiles: Perfil[],
    datos: NuevaEvidencia,
    archivo: ArchivoSubido,
    comprobarOrigen: (db: PoolClient) => Promise<Origen>,
  ): Promise<{ id: string }> {
    const clave = `${sesion.establecimiento_id}/evidencias/${randomUUID()}.${datos.archivo.formato}`;
    let subido = false;
    try {
      return await this.cuentas.operar(
        sesion,
        { tipo: 'establecimiento', perfiles },
        async (db) => {
          const origen = await comprobarOrigen(db);
          const guardado = await db.query<{ id: string }>(
            `INSERT INTO convi.archivos
               (establecimiento_id, clave_almacenamiento, nombre_original,
                tipo_mime, tamano_bytes, sha256, subido_por)
             VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5,
                     convi.membresia_actual())
             RETURNING id`,
            [
              clave,
              datos.archivo.nombre,
              datos.archivo.mime,
              datos.archivo.tamano,
              datos.archivo.sha256,
            ],
          );
          const evidencia = await db.query<{ id: string }>(
            `INSERT INTO convi.evidencias
               (establecimiento_id, archivo_id, tipo_evidencia, titulo,
                descripcion, ${origen.columna}, creado_por)
             VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5,
                     convi.membresia_actual())
             RETURNING id`,
            [
              guardado.rows[0].id,
              datos.tipo,
              datos.titulo,
              datos.descripcion,
              origen.id,
            ],
          );
          const { error } = await this.supabase.storage
            .from(ESPACIO)
            .upload(clave, archivo.buffer, {
              contentType: datos.archivo.mime,
              upsert: false,
            });
          if (error)
            throw new ServiceUnavailableException(
              'No pudimos guardar el archivo. Inténtalo de nuevo en unos minutos.',
            );
          subido = true;
          return { id: evidencia.rows[0].id };
        },
      );
    } catch (error) {
      if (subido) await this.conciliar(sesion, perfiles, clave);
      throw error;
    }
  }

  // Storage no participa del COMMIT. Igual que en las importaciones (PB-019):
  // antes de borrar el archivo subido se confirma en otra transacción que no
  // quedó registrado, porque un COMMIT puede guardarse aunque se pierda su
  // respuesta de red.
  private async conciliar(sesion: Sesion, perfiles: Perfil[], clave: string) {
    try {
      const registrado = await this.cuentas.operar(
        sesion,
        { tipo: 'establecimiento', perfiles },
        async (db) =>
          (
            await db.query(
              'SELECT 1 FROM convi.archivos WHERE clave_almacenamiento = $1',
              [clave],
            )
          ).rows.length > 0,
      );
      if (!registrado) {
        const limpieza = await this.supabase.storage
          .from(ESPACIO)
          .remove([clave]);
        if (limpieza.error) throw limpieza.error;
      }
    } catch {
      // Sin exponer contenido, claves ni datos personales en los registros.
      this.logger.error('No se pudo conciliar una evidencia fallida.');
    }
  }
}
