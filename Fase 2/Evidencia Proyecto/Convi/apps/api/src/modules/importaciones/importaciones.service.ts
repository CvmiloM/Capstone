import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  type ArchivoSubido,
  errorDeCampos,
  FORMATOS,
  type TipoImportacion,
  validarCarga,
} from './importacion.js';
import { ArchivoNoValido, leerArchivo } from './lector.js';

// PB-019 (HU-015): carga del archivo de una importación administrativa. El
// archivo queda en el espacio privado de Storage y cada fila, sin cambios, en
// convi.filas_importacion. CA5: nada se guarda en las fichas todavía.
const PERFILES: Perfil[] = ['ADMIN'];
const ESPACIO = 'convi-privado';
const FILAS_MUESTRA = 50;

/** Cliente de Supabase con la clave de servicio, solo para Storage. */
export const SUPABASE_STORAGE = Symbol('SUPABASE_STORAGE');

export type Importacion = {
  id: string;
  tipo_importacion: TipoImportacion;
  /** CARGADO, PROCESANDO, REVISION, CONFIRMADO, FALLIDO o CANCELADO. */
  estado: string;
  archivo_nombre: string;
  archivo_bytes: number;
  /** Fecha y hora ISO. */
  creado_en: string;
  creado_por: string;
  filas: number;
};

export type DetalleImportacion = Importacion & {
  columnas: string[];
  /** Las primeras filas del archivo, tal como venían. */
  muestra: { numero_fila: number; datos_originales: Record<string, string> }[];
};

const COLUMNAS = `
  p.id, p.tipo_importacion, p.estado,
  a.nombre_original AS archivo_nombre, a.tamano_bytes::int AS archivo_bytes,
  p.creado_en, pe.nombres || ' ' || pe.apellidos AS creado_por,
  (SELECT count(*) FROM convi.filas_importacion f
    WHERE f.proceso_importacion_id = p.id)::int AS filas`;

const DESDE = `
  FROM convi.procesos_importacion p
  JOIN convi.archivos a ON a.id = p.archivo_id
  JOIN convi.membresias_establecimiento me ON me.id = p.creado_por
  JOIN convi.personas pe ON pe.id = me.persona_id`;

@Injectable()
export class ImportacionesService {
  constructor(
    @Inject(CuentaService) private readonly cuentas: CuentaService,
    @Inject(SUPABASE_STORAGE) private readonly supabase: SupabaseClient,
  ) {}

  // Las 100 importaciones más recientes de la escuela.
  listar(sesion: Sesion): Promise<Importacion[]> {
    return this.operar(sesion, async (db) => {
      const resultado = await db.query<Importacion>(
        `SELECT ${COLUMNAS} ${DESDE} ORDER BY p.creado_en DESC LIMIT 100`,
      );
      return resultado.rows;
    });
  }

  // La importación con sus columnas y sus primeras filas.
  obtener(sesion: Sesion, id: string): Promise<DetalleImportacion> {
    return this.operar(sesion, (db) => buscar(db, id));
  }

  // CA1 y CA2: guarda el archivo en el espacio privado, crea la importación
  // Cargada y una fila por cada fila del archivo, todo en la misma operación.
  async cargar(
    sesion: Sesion,
    tipo: unknown,
    archivo: ArchivoSubido | undefined,
  ): Promise<DetalleImportacion> {
    const carga = validarCarga(tipo, archivo);
    const contenido = (archivo as ArchivoSubido).buffer;
    let hoja: Awaited<ReturnType<typeof leerArchivo>>;
    try {
      hoja = await leerArchivo(contenido, carga.formato);
    } catch (error) {
      if (error instanceof ArchivoNoValido)
        throw errorDeCampos({ archivo: error.message });
      throw error;
    }
    const clave = `${sesion.establecimiento_id}/importaciones/${randomUUID()}.${carga.formato}`;
    const sha256 = createHash('sha256').update(contenido).digest('hex');

    return this.operar(sesion, async (db) => {
      const guardado = await db.query<{ id: string }>(
        `INSERT INTO convi.archivos
           (establecimiento_id, clave_almacenamiento, nombre_original,
            tipo_mime, tamano_bytes, sha256, subido_por)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5,
                 convi.membresia_actual())
         RETURNING id`,
        [
          clave,
          carga.nombre,
          FORMATOS[carga.formato],
          contenido.length,
          sha256,
        ],
      );
      const proceso = await db.query<{ id: string }>(
        `INSERT INTO convi.procesos_importacion
           (establecimiento_id, archivo_id, tipo_importacion, creado_por,
            opciones_importacion)
         VALUES (convi.establecimiento_actual(), $1, $2,
                 convi.membresia_actual(), $3::jsonb)
         RETURNING id`,
        [
          guardado.rows[0].id,
          carga.tipo,
          JSON.stringify({ columnas: hoja.columnas, formato: carga.formato }),
        ],
      );
      // Todas las filas en una sola sentencia; datos_originales ya no cambia
      // (convi.validar_integracion).
      await db.query(
        `INSERT INTO convi.filas_importacion
           (establecimiento_id, proceso_importacion_id, numero_fila,
            datos_originales)
         SELECT convi.establecimiento_actual(), $1,
                (f->>'numero')::int, f->'datos'
         FROM jsonb_array_elements($2::jsonb) f`,
        [proceso.rows[0].id, JSON.stringify(hoja.filas)],
      );
      // Al final, el archivo va al espacio privado: si Storage falla, la base
      // deshace todo y no queda una importación sin archivo.
      const { error } = await this.supabase.storage
        .from(ESPACIO)
        .upload(clave, contenido, {
          contentType: FORMATOS[carga.formato],
          upsert: false,
        });
      if (error)
        throw new ServiceUnavailableException(
          'No pudimos guardar el archivo. Inténtalo de nuevo en unos minutos.',
        );
      return buscar(db, proceso.rows[0].id);
    });
  }

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      trabajo,
    );
  }
}

async function buscar(db: PoolClient, id: string): Promise<DetalleImportacion> {
  const proceso = await db.query<Importacion & { columnas: string[] }>(
    `SELECT ${COLUMNAS},
            coalesce(p.opciones_importacion->'columnas', '[]'::jsonb) AS columnas
     ${DESDE} WHERE p.id = $1`,
    [id],
  );
  if (proceso.rows.length === 0)
    throw new NotFoundException('No encontramos esa importación.');
  const muestra = await db.query<DetalleImportacion['muestra'][number]>(
    `SELECT numero_fila, datos_originales
     FROM convi.filas_importacion
     WHERE proceso_importacion_id = $1
     ORDER BY numero_fila
     LIMIT ${FILAS_MUESTRA}`,
    [id],
  );
  return { ...proceso.rows[0], muestra: muestra.rows };
}