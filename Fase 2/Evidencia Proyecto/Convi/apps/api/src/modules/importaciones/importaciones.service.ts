import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { texto } from '../academico/curso.js';
import {
  CAMPOS,
  sugerirMapeo,
  USO_DEL_ANIO,
  type UsoDelAnio,
} from './campos.js';
import { cargarContexto } from './contexto.js';
import {
  type ArchivoSubido,
  errorDeCampos,
  FORMATOS,
  TIPOS,
  type TipoImportacion,
  validarCarga,
} from './importacion.js';
import { ArchivoNoValido, leerArchivo } from './lector.js';
import { validarRevision } from './mapeo.js';
import { crearPlantilla, nombreDePlantilla } from './plantilla.js';
import { type Problema, revisarFilas } from './revision.js';
import type { FormatoFecha, TratamientoDuplicado } from './valores.js';

// PB-019 y PB-020 (HU-015): importaciones administrativas. Cargar guarda el
// archivo en el espacio privado de Storage y cada fila, sin cambios, en
// convi.filas_importacion; revisar relaciona las columnas con los campos de
// CONVI y deja cada fila Válida, Con advertencia o Con error. CA5: nada se
// guarda en las fichas hasta confirmar (PB-026).
const PERFILES: Perfil[] = ['ADMIN'];
const ESPACIO = 'convi-privado';
const FILAS_POR_PAGINA = 50;
const ESTADOS_FILA = [
  'PENDIENTE',
  'VALIDO',
  'ADVERTENCIA',
  'ERROR',
  'CONFIRMADO',
  'OMITIDO',
] as const;
type EstadoFila = (typeof ESTADOS_FILA)[number];

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

export type FilaImportacion = {
  numero_fila: number;
  estado: EstadoFila;
  datos_originales: Record<string, string>;
  /** null mientras la fila no se haya revisado. */
  datos_normalizados: Record<string, string | boolean | null> | null;
  problemas: Problema[] | null;
};

export type DetalleImportacion = Importacion & {
  columnas: string[];
  /** Los campos de CONVI del tipo, en el orden de la plantilla. */
  campos: {
    clave: string;
    titulo: string;
    obligatorio: boolean;
    descripcion: string;
    unir: boolean;
  }[];
  uso_del_anio: UsoDelAnio;
  /** Columna → campo: el de la última revisión o, antes de revisar, el sugerido por los títulos. */
  mapeo: Record<string, string>;
  opciones: {
    anio_academico_id: string | null;
    formato_fecha: FormatoFecha;
    duplicados: TratamientoDuplicado;
  };
  /** Años Planificados y Activos, para elegir al revisar. */
  anios: { id: string; anio: number; estado: string }[];
  /** Cantidad de filas por estado. */
  resumen: Record<EstadoFila, number>;
  pagina: {
    estado: EstadoFila | null;
    numero: number;
    /** Filas con el estado filtrado (o todas). */
    filas: number;
    paginas: number;
  };
  /** Las filas de la página, con sus datos originales y su revisión. */
  muestra: FilaImportacion[];
};

export type FiltroFilas = { estado: EstadoFila | null; pagina: number };

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

const NOMBRE_ESTADO: Record<string, string> = {
  PROCESANDO: 'confirmándose',
  CONFIRMADO: 'confirmada',
  FALLIDO: 'fallida',
  CANCELADO: 'cancelada',
};

/** Estado y página de la lista de filas, como vienen en la dirección. */
export function validarFiltro(estado: unknown, pagina: unknown): FiltroFilas {
  const elegido = texto(estado).toUpperCase();
  const numero = Number(texto(pagina) || '1');
  return {
    estado: (ESTADOS_FILA as readonly string[]).includes(elegido)
      ? (elegido as EstadoFila)
      : null,
    pagina: Number.isInteger(numero) && numero >= 1 ? numero : 1,
  };
}

@Injectable()
export class ImportacionesService {
  private readonly logger = new Logger(ImportacionesService.name);

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

  // La importación con sus columnas, su revisión y una página de filas.
  obtener(
    sesion: Sesion,
    id: string,
    filtro: FiltroFilas,
  ): Promise<DetalleImportacion> {
    return this.operar(sesion, (db) => buscar(db, id, filtro));
  }

  // Decisión del PO: plantilla XLSX con los títulos y una fila de ejemplo.
  async plantilla(tipo: string) {
    const elegido = tipo.toUpperCase();
    if (!(TIPOS as readonly string[]).includes(elegido))
      throw new NotFoundException('No hay plantilla para ese tipo de datos.');
    return {
      nombre: nombreDePlantilla(elegido as TipoImportacion),
      contenido: await crearPlantilla(elegido as TipoImportacion),
    };
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

    let subido = false;
    try {
      return await this.operar(sesion, async (db) => {
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
        subido = true;
        return buscar(db, proceso.rows[0].id, { estado: null, pagina: 1 });
      });
    } catch (error) {
      if (subido) {
        try {
          // Storage no participa del COMMIT SQL. Antes de compensar, confirmar
          // en otra transacción que el archivo no quedó registrado: un COMMIT
          // puede haberse guardado aunque se haya perdido su respuesta de red.
          const registrado = await this.operar(sesion, async (db) => {
            const resultado = await db.query(
              `SELECT 1 FROM convi.archivos WHERE clave_almacenamiento = $1`,
              [clave],
            );
            return resultado.rows.length > 0;
          });
          if (!registrado) {
            const limpieza = await this.supabase.storage
              .from(ESPACIO)
              .remove([clave]);
            if (limpieza.error) throw limpieza.error;
          }
        } catch {
          // Si no se puede confirmar o limpiar, conservar el archivo y avisar
          // sin exponer contenido, claves ni datos personales en los logs.
          this.logger.error(
            'No se pudo conciliar una carga fallida de importación.',
          );
        }
      }
      throw error;
    }
  }

  // PB-020 (CA3 y CA4): guarda qué campo trae cada columna y las opciones, y
  // revisa todas las filas. La importación queda En revisión; se puede volver
  // a revisar con otro mapeo mientras ninguna fila esté confirmada.
  revisar(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<DetalleImportacion> {
    return this.operar(sesion, async (db) => {
      // FOR UPDATE: si otra persona revisa la misma importación al mismo
      // tiempo, la segunda operación falla (40001) en vez de mezclar filas.
      const proceso = await db.query<{
        tipo_importacion: TipoImportacion;
        estado: string;
        columnas: string[];
      }>(
        `SELECT tipo_importacion, estado,
                coalesce(opciones_importacion->'columnas', '[]'::jsonb) AS columnas
         FROM convi.procesos_importacion
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      if (proceso.rows.length === 0)
        throw new NotFoundException('No encontramos esa importación.');
      const { tipo_importacion: tipo, estado, columnas } = proceso.rows[0];
      if (estado !== 'CARGADO' && estado !== 'REVISION')
        throw new ConflictException(
          `La importación está ${NOMBRE_ESTADO[estado] ?? estado.toLowerCase()}: ya no se puede revisar.`,
        );
      const confirmadas = await db.query(
        `SELECT 1 FROM convi.filas_importacion
         WHERE proceso_importacion_id = $1 AND estado = 'CONFIRMADO'
         LIMIT 1`,
        [id],
      );
      if (confirmadas.rows.length > 0)
        throw new ConflictException(
          'La importación ya tiene filas confirmadas: no se vuelve a revisar.',
        );

      const revision = validarRevision(cuerpo, tipo, columnas);
      const contexto = await cargarContexto(
        db,
        tipo,
        revision.anio_academico_id,
      );
      const filas = await db.query<{
        numero_fila: number;
        datos_originales: Record<string, string>;
      }>(
        `SELECT numero_fila, datos_originales
         FROM convi.filas_importacion
         WHERE proceso_importacion_id = $1
         ORDER BY numero_fila`,
        [id],
      );
      const revisadas = revisarFilas(
        tipo,
        filas.rows,
        columnas,
        revision,
        contexto,
      );

      // Todas las filas en una sola sentencia; los datos originales no cambian.
      await db.query(
        `UPDATE convi.filas_importacion f
         SET estado = r.estado, datos_normalizados = r.datos,
             problemas = r.problemas
         FROM jsonb_to_recordset($2::jsonb)
              AS r(numero int, estado text, datos jsonb, problemas jsonb)
         WHERE f.proceso_importacion_id = $1 AND f.numero_fila = r.numero`,
        [id, JSON.stringify(revisadas)],
      );
      // El cambio queda en la auditoría (convi.auditar_cambio).
      await db.query(
        `UPDATE convi.procesos_importacion
         SET estado = 'REVISION', mapeo_columnas = $2::jsonb,
             opciones_importacion = opciones_importacion || $3::jsonb
         WHERE id = $1`,
        [
          id,
          JSON.stringify(revision.mapeo),
          JSON.stringify({
            anio_academico_id: revision.anio_academico_id,
            anio: contexto.anio?.anio ?? null,
            formato_fecha: revision.formato_fecha,
            duplicados: revision.duplicados,
          }),
        ],
      );
      return buscar(db, id, { estado: null, pagina: 1 });
    });
  }

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        try {
          return await trabajo(db);
        } catch (error) {
          if ((error as { code?: string } | null)?.code === '40001')
            throw new ConflictException(
              'Otra persona cambió esta importación al mismo tiempo. Recarga la página e inténtalo de nuevo.',
            );
          throw error;
        }
      },
    );
  }
}

async function buscar(
  db: PoolClient,
  id: string,
  filtro: FiltroFilas,
): Promise<DetalleImportacion> {
  const proceso = await db.query<
    Importacion & {
      columnas: string[];
      mapeo: Record<string, string>;
      opciones: Record<string, unknown>;
    }
  >(
    `SELECT ${COLUMNAS},
            coalesce(p.opciones_importacion->'columnas', '[]'::jsonb) AS columnas,
            p.mapeo_columnas AS mapeo, p.opciones_importacion AS opciones
     ${DESDE} WHERE p.id = $1`,
    [id],
  );
  if (proceso.rows.length === 0)
    throw new NotFoundException('No encontramos esa importación.');
  const { columnas, mapeo, opciones, ...importacion } = proceso.rows[0];
  const tipo = importacion.tipo_importacion;

  const anios = await db.query<DetalleImportacion['anios'][number]>(
    `SELECT id, anio, estado FROM convi.anios_academicos
     WHERE estado IN ('PLANIFICADO', 'ACTIVO')
     ORDER BY anio DESC`,
  );
  const conteo = await db.query<{ estado: EstadoFila; filas: number }>(
    `SELECT estado, count(*)::int AS filas
     FROM convi.filas_importacion
     WHERE proceso_importacion_id = $1
     GROUP BY estado`,
    [id],
  );
  const resumen = Object.fromEntries(
    ESTADOS_FILA.map((estado) => [
      estado,
      conteo.rows.find((c) => c.estado === estado)?.filas ?? 0,
    ]),
  ) as Record<EstadoFila, number>;

  const filas = filtro.estado ? resumen[filtro.estado] : importacion.filas;
  const paginas = Math.max(1, Math.ceil(filas / FILAS_POR_PAGINA));
  const numero = Math.min(filtro.pagina, paginas);
  const muestra = await db.query<FilaImportacion>(
    `SELECT numero_fila, estado, datos_originales, datos_normalizados,
            problemas
     FROM convi.filas_importacion
     WHERE proceso_importacion_id = $1
       AND ($2::text IS NULL OR estado = $2)
     ORDER BY numero_fila
     LIMIT ${FILAS_POR_PAGINA} OFFSET $3`,
    [id, filtro.estado, (numero - 1) * FILAS_POR_PAGINA],
  );

  // Antes de revisar no hay mapeo guardado: se sugiere por los títulos. El
  // año por omisión es el Activo.
  const revisada = Object.keys(mapeo).length > 0;
  const activo = anios.rows.find((a) => a.estado === 'ACTIVO');
  return {
    ...importacion,
    columnas,
    campos: CAMPOS[tipo].map((campo) => ({
      clave: campo.clave,
      titulo: campo.titulo,
      obligatorio: campo.obligatorio,
      descripcion: campo.descripcion,
      unir: campo.unir ?? false,
    })),
    uso_del_anio: USO_DEL_ANIO[tipo],
    mapeo: revisada ? mapeo : sugerirMapeo(tipo, columnas),
    opciones: {
      anio_academico_id:
        typeof opciones.anio_academico_id === 'string'
          ? opciones.anio_academico_id
          : (activo?.id ?? null),
      formato_fecha:
        opciones.formato_fecha === 'MM-DD-AAAA' ? 'MM-DD-AAAA' : 'DD-MM-AAAA',
      duplicados: opciones.duplicados === 'ERROR' ? 'ERROR' : 'USAR_EXISTENTE',
    },
    anios: anios.rows,
    resumen,
    pagina: { estado: filtro.estado, numero, filas, paginas },
    muestra: muestra.rows,
  };
}
