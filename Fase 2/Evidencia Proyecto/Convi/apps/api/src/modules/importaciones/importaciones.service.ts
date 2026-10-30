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
import { objeto, texto } from '../academico/curso.js';
import {
  CAMPOS,
  sugerirMapeo,
  USO_DEL_ANIO,
  type UsoDelAnio,
} from './campos.js';
import {
  CONFIRMAR,
  confirmarEstudiantesEnLote,
  type Confirmacion,
  type Entidades,
  LimiteDeCorreos,
  PRINCIPAL,
  problemaDeError,
} from './confirmacion.js';
import {
  aTiempo,
  COLA_CONFIRMACION,
  type ColaConfirmacion,
  sesionDelTrabajo,
  type TrabajoConfirmacion,
} from './cola.js';
import { confirmacionRepetida } from './confirmacion-repetida.js';
import { cargarContexto } from './contexto.js';
import {
  type ArchivoSubido,
  errorDeCampos,
  FORMATOS,
  TIPOS,
  type TipoImportacion,
  validarCarga,
} from './importacion.js';
import { ArchivoNoValido, LecturaNoDisponible, leerArchivo } from './lector.js';
import { validarRevision } from './mapeo.js';
import { crearPlantilla, nombreDePlantilla } from './plantilla.js';
import { type FilaRevisada, type Problema, revisarFilas } from './revision.js';
import type { FormatoFecha, TratamientoDuplicado } from './valores.js';

// PB-019, PB-020, PB-026 y PB-027 (HU-015 y HU-020): importaciones
// administrativas. Cargar guarda el archivo en el espacio privado de Storage y
// cada fila, sin cambios, en convi.filas_importacion; revisar relaciona las
// columnas con los campos de CONVI y deja cada fila Válida, Con advertencia o
// Con error; recién confirmar guarda en las fichas las filas que se pueden
// confirmar, en segundo plano.
const PERFILES: Perfil[] = ['ADMIN'];
const ESPACIO = 'convi-privado';
const FILAS_POR_PAGINA = 50;
// Acotar cada sentencia sin perder la transacción completa ni subir su timeout.
const FILAS_POR_LOTE = 1000;
// Cada tramo de la confirmación es una transacción y el avance se ve al
// terminar cada uno; los profesores van de a uno porque cada uno recibe su
// invitación por correo.
const FILAS_POR_TRAMO = 50;
// Cuánto espera la API a Redis al encolar antes de responder que no pudo.
const PLAZO_REDIS = 5000;
const ESTADOS_FILA = [
  'PENDIENTE',
  'VALIDO',
  'ADVERTENCIA',
  'ERROR',
  'CONFIRMADO',
  'OMITIDO',
] as const;
type EstadoFila = (typeof ESTADOS_FILA)[number];

/** Cliente de Supabase con la clave de servicio: Storage e invitaciones de profesores (PB-026). */
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
  /** Fecha y hora ISO; null mientras no esté Confirmada. */
  confirmado_en: string | null;
  filas: number;
};

export type FilaImportacion = {
  numero_fila: number;
  estado: EstadoFila;
  datos_originales: Record<string, string>;
  /** null mientras la fila no se haya revisado. */
  datos_normalizados: Record<string, string | boolean | null> | null;
  problemas: Problema[] | null;
  /** Lo que creó o reutilizó la fila al confirmarla (HU-020 CA1). */
  entidades_confirmadas: Entidades;
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
  /** La confirmación en curso o la última; null si nunca se confirmó. */
  confirmacion: EstadoConfirmacion | null;
};

export type FiltroFilas = { estado: EstadoFila | null; pagina: number };

export type ResultadoConfirmacion = {
  confirmadas: number;
  /** Filas que no se pudieron confirmar: al volver a revisarlas o al guardarlas. */
  con_error: number;
  /** Profesores que quedaron sin invitar por el límite de correos. */
  sin_enviar: number;
};

/** PB-027 (HU-020 CA5): la confirmación en segundo plano. */
export type EstadoConfirmacion = {
  incluir_advertencias: boolean;
  /** Filas que entraron a la confirmación. */
  total: number;
  /** Las ya procesadas (confirmadas o con error), contando las filas. */
  procesadas: number;
  /** Fecha y hora ISO. */
  iniciada_en: string;
  /** Fecha y hora ISO; null mientras se confirma. */
  terminada_en: string | null;
  resultado: ResultadoConfirmacion | null;
  /** Hay un trabajo en la cola para esta importación. */
  en_curso: boolean;
};

/** Lo que la pantalla consulta mientras la importación está Procesando. */
export type AvanceImportacion = {
  estado: string;
  resumen: Record<EstadoFila, number>;
  confirmacion: EstadoConfirmacion | null;
};

/**
 * Lo que se guarda en opciones_importacion.confirmacion (jsonb del modelo).
 * Los conteos al iniciar permiten calcular el resultado aunque el trabajo se
 * haya interrumpido y reanudado.
 */
type ConfirmacionGuardada = {
  incluir_advertencias: boolean;
  total: number;
  iniciada_en: string;
  confirmadas_al_iniciar: number;
  errores_al_iniciar: number;
  con_error_al_revisar: number;
  terminada_en: string | null;
  resultado: ResultadoConfirmacion | null;
};

const DATOS_PROCESO = `
  p.id, p.tipo_importacion, p.estado,
  a.nombre_original AS archivo_nombre, a.tamano_bytes::int AS archivo_bytes,
  p.creado_en, pe.nombres || ' ' || pe.apellidos AS creado_por,
  p.confirmado_en`;
const COLUMNAS = `${DATOS_PROCESO},
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
    @Inject(COLA_CONFIRMACION) private readonly cola: ColaConfirmacion | null,
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
  async obtener(
    sesion: Sesion,
    id: string,
    filtro: FiltroFilas,
  ): Promise<DetalleImportacion> {
    const detalle = await this.operar(sesion, (db) => buscar(db, id, filtro));
    return this.conEnCurso(id, detalle);
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
      if (error instanceof LecturaNoDisponible)
        throw new ServiceUnavailableException(error.message);
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
        // Lotes dentro de la misma transacción; datos_originales ya no cambia.
        for (
          let inicio = 0;
          inicio < hoja.filas.length;
          inicio += FILAS_POR_LOTE
        ) {
          await db.query(
            `INSERT INTO convi.filas_importacion
           (establecimiento_id, proceso_importacion_id, numero_fila,
            datos_originales)
         SELECT convi.establecimiento_actual(), $1,
                (f->>'numero')::int, f->'datos'
         FROM jsonb_array_elements($2::jsonb) f`,
            [
              proceso.rows[0].id,
              JSON.stringify(hoja.filas.slice(inicio, inicio + FILAS_POR_LOTE)),
            ],
          );
        }
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
      if (estado === 'PROCESANDO')
        throw new ConflictException(
          'La importación se está confirmando: espera a que termine.',
        );
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

      await actualizarFilas(db, id, revisadas);
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

  // PB-026 y PB-027 (HU-020): guarda en las fichas las filas Válidas y, si se
  // pide, las Con advertencia. Primero las revisa de nuevo con lo que hay hoy
  // en la escuela (CA4); después la importación queda Procesando y la cola la
  // confirma en segundo plano, por tramos (trabajador.ts). Una fila que falla
  // queda Con error y las demás siguen; una fila Confirmada no se vuelve a
  // procesar (CA2).
  async confirmar(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<DetalleImportacion> {
    const cola = this.exigirCola('iniciar');
    const incluirAdvertencias = objeto(cuerpo).incluir_advertencias === true;

    const { detalle, repetida } = await this.operar(sesion, async (db) => {
      const proceso = await bloquear(db, id);
      // PB-146 (HU-125): la misma confirmación repetida (doble clic, la red la
      // reintenta) no inicia otra: responde la misma importación con su avance.
      if (confirmacionRepetida(proceso.estado))
        return {
          repetida: true,
          detalle: await buscar(db, id, { estado: null, pagina: 1 }),
        };
      exigirRevision(proceso.estado, 'confirmar');
      const tipo = proceso.tipo_importacion;
      // Las mismas opciones de la última revisión.
      const revision = validarRevision(
        {
          mapeo: proceso.mapeo,
          anio_academico_id: proceso.opciones.anio_academico_id,
          formato_fecha: proceso.opciones.formato_fecha,
          duplicados: proceso.opciones.duplicados,
        },
        tipo,
        proceso.columnas,
      );
      const contexto = await cargarContexto(
        db,
        tipo,
        revision.anio_academico_id,
      );
      const filas = await db.query<{
        numero_fila: number;
        datos_originales: Record<string, string>;
        estado: EstadoFila;
      }>(
        `SELECT numero_fila, datos_originales, estado
         FROM convi.filas_importacion
         WHERE proceso_importacion_id = $1
         ORDER BY numero_fila`,
        [id],
      );
      const antes = new Map(filas.rows.map((f) => [f.numero_fila, f.estado]));
      // Las confirmadas y las omitidas ya no cambian.
      const abiertas = revisarFilas(
        tipo,
        filas.rows,
        proceso.columnas,
        revision,
        contexto,
      ).filter(
        (f) => !['CONFIRMADO', 'OMITIDO'].includes(antes.get(f.numero) ?? ''),
      );
      await actualizarFilas(db, id, abiertas);

      const resumen = await contarFilas(db, id);
      const ahora = new Date().toISOString();
      const conErrorAlRevisar = abiertas.filter(
        (f) => f.estado === 'ERROR' && antes.get(f.numero) !== 'ERROR',
      ).length;
      const confirmacion: ConfirmacionGuardada = {
        incluir_advertencias: incluirAdvertencias,
        total: pendientes(resumen, incluirAdvertencias),
        iniciada_en: ahora,
        confirmadas_al_iniciar: resumen.CONFIRMADO,
        errores_al_iniciar: resumen.ERROR,
        con_error_al_revisar: conErrorAlRevisar,
        terminada_en: null,
        resultado: null,
      };
      if (confirmacion.total === 0) {
        // Nada que guardar: queda el resultado de volver a revisar.
        confirmacion.terminada_en = ahora;
        confirmacion.resultado = {
          confirmadas: 0,
          con_error: conErrorAlRevisar,
          sin_enviar: 0,
        };
      }
      // El cambio de estado queda en la auditoría (convi.auditar_cambio).
      await db.query(
        `UPDATE convi.procesos_importacion
         SET estado = $2,
             opciones_importacion = jsonb_set(opciones_importacion,
                                              '{confirmacion}', $3::jsonb)
         WHERE id = $1`,
        [
          id,
          confirmacion.total === 0 ? 'REVISION' : 'PROCESANDO',
          JSON.stringify(confirmacion),
        ],
      );
      return {
        repetida: false,
        detalle: await buscar(db, id, { estado: null, pagina: 1 }),
      };
    });
    if (repetida) return this.conEnCurso(id, detalle);
    if (detalle.estado !== 'PROCESANDO') return detalle;

    try {
      // jobId: una importación tiene a lo más un trabajo en la cola.
      await aTiempo(
        cola.add(
          'confirmar',
          { importacion_id: id, sesion: sesionDelTrabajo(sesion) },
          { jobId: id },
        ),
        PLAZO_REDIS,
      );
    } catch {
      // Sin trabajo en la cola, la importación vuelve a En revisión.
      await this.operar(sesion, (db) =>
        db.query(
          `UPDATE convi.procesos_importacion
           SET estado = 'REVISION',
               opciones_importacion = opciones_importacion - 'confirmacion'
           WHERE id = $1 AND estado = 'PROCESANDO'`,
          [id],
        ),
      ).catch(() =>
        this.logger.error(
          'Una importación quedó Procesando sin trabajo en la cola: se puede reanudar.',
        ),
      );
      throw new ServiceUnavailableException(
        'No pudimos iniciar la confirmación. Inténtalo de nuevo en unos minutos.',
      );
    }
    return this.marcarEnCurso(detalle, true);
  }

  // PB-027: lo que hace el trabajador de la cola. Confirma tramo por tramo
  // mientras la importación siga Procesando; cada tramo es una transacción con
  // la sesión de quien pidió la confirmación, comprobada de nuevo.
  async procesarConfirmacion({
    importacion_id: id,
    sesion,
  }: TrabajoConfirmacion) {
    for (;;) {
      const fin = await this.operar(sesion, (db) =>
        confirmarTramo(db, this.supabase, id),
      );
      if (fin) return;
    }
  }

  // PB-027: si la confirmación se detuvo (la API se reinició más veces de las
  // que la cola reintenta, o Redis perdió el trabajo), vuelve a encolarla con
  // la sesión de quien la reanuda. Sigue desde la fila donde quedó.
  async reanudar(sesion: Sesion, id: string): Promise<DetalleImportacion> {
    const cola = this.exigirCola('reanudar');
    const detalle = await this.operar(sesion, async (db) => {
      const proceso = await bloquear(db, id);
      if (proceso.estado !== 'PROCESANDO')
        throw new ConflictException(
          'La importación no se está confirmando: no hay nada que reanudar.',
        );
      return buscar(db, id, { estado: null, pagina: 1 });
    });
    if (await this.enCurso(id))
      throw new ConflictException(
        'La confirmación sigue en curso: espera a que avance.',
      );
    try {
      await aTiempo(
        cola.add(
          'confirmar',
          { importacion_id: id, sesion: sesionDelTrabajo(sesion) },
          { jobId: id },
        ),
        PLAZO_REDIS,
      );
    } catch {
      throw new ServiceUnavailableException(
        'No pudimos reanudar la confirmación. Inténtalo de nuevo en unos minutos.',
      );
    }
    return this.marcarEnCurso(detalle, true);
  }

  // PB-027 (HU-020 CA5): el estado, los conteos y el avance, sin las filas.
  // La pantalla lo consulta cada pocos segundos mientras está Procesando.
  async avance(sesion: Sesion, id: string): Promise<AvanceImportacion> {
    const avance = await this.operar(sesion, async (db) => {
      const proceso = await db.query<{
        estado: string;
        opciones: Record<string, unknown>;
      }>(
        `SELECT estado, opciones_importacion AS opciones
         FROM convi.procesos_importacion WHERE id = $1`,
        [id],
      );
      if (proceso.rows.length === 0)
        throw new NotFoundException('No encontramos esa importación.');
      const { estado, opciones } = proceso.rows[0];
      const resumen = await contarFilas(db, id);
      return {
        estado,
        resumen,
        confirmacion: estadoConfirmacion(estado, opciones, resumen),
      };
    });
    return this.conEnCurso(id, avance);
  }

  // PB-026 (HU-020 CA5): las filas Con error se marcan Omitidas y no se
  // importan. Si ya no quedan filas abiertas, la importación queda Confirmada.
  omitir(sesion: Sesion, id: string): Promise<DetalleImportacion> {
    return this.operar(sesion, async (db) => {
      const proceso = await bloquear(db, id);
      exigirRevision(proceso.estado, 'omitir filas');
      const omitidas = await db.query(
        `UPDATE convi.filas_importacion SET estado = 'OMITIDO'
         WHERE proceso_importacion_id = $1 AND estado = 'ERROR'`,
        [id],
      );
      if (!omitidas.rowCount)
        throw new ConflictException('No hay filas con error para omitir.');
      await cerrarSiCorresponde(db, id);
      return buscar(db, id, { estado: null, pagina: 1 });
    });
  }

  private exigirCola(accion: 'iniciar' | 'reanudar') {
    if (!this.cola)
      throw new ServiceUnavailableException(
        `No pudimos ${accion} la confirmación: falta configurar la cola en la API.`,
      );
    return this.cola;
  }

  /** Si hay un trabajo en la cola para la importación. Sin Redis, se da por detenida. */
  private async enCurso(id: string) {
    if (!this.cola) return false;
    try {
      // Sin respuesta de Redis la página igual carga: se da por detenida.
      const estado = await aTiempo(this.cola.getJobState(id), 2000);
      return ['waiting', 'active', 'delayed', 'prioritized'].includes(estado);
    } catch {
      return false;
    }
  }

  /** Mientras está Procesando, agrega si la cola la sigue confirmando. */
  private async conEnCurso<
    T extends { estado: string; confirmacion: EstadoConfirmacion | null },
  >(id: string, datos: T): Promise<T> {
    if (datos.estado !== 'PROCESANDO') return datos;
    return this.marcarEnCurso(datos, await this.enCurso(id));
  }

  private marcarEnCurso<T extends { confirmacion: EstadoConfirmacion | null }>(
    datos: T,
    enCurso: boolean,
  ): T {
    return datos.confirmacion
      ? { ...datos, confirmacion: { ...datos.confirmacion, en_curso: enCurso } }
      : datos;
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
    Omit<Importacion, 'filas'> & {
      columnas: string[];
      mapeo: Record<string, string>;
      opciones: Record<string, unknown>;
      anios: DetalleImportacion['anios'];
    }
  >(
    `SELECT ${DATOS_PROCESO},
            coalesce(p.opciones_importacion->'columnas', '[]'::jsonb) AS columnas,
            p.mapeo_columnas AS mapeo, p.opciones_importacion AS opciones,
            coalesce((
              SELECT jsonb_agg(jsonb_build_object('id', id, 'anio', anio,
                                                 'estado', estado) ORDER BY anio DESC)
              FROM convi.anios_academicos
              WHERE estado IN ('PLANIFICADO', 'ACTIVO')
            ), '[]'::jsonb) AS anios
     ${DESDE} WHERE p.id = $1`,
    [id],
  );
  if (proceso.rows.length === 0)
    throw new NotFoundException('No encontramos esa importación.');
  const { columnas, mapeo, opciones, anios, ...importacion } = proceso.rows[0];
  const tipo = importacion.tipo_importacion;

  const resumen = await contarFilas(db, id);

  // El mismo conteo sirve para el total; no volver a recorrer las filas.
  const total = Object.values(resumen).reduce(
    (suma, cantidad) => suma + cantidad,
    0,
  );
  const filas = filtro.estado ? resumen[filtro.estado] : total;
  const paginas = Math.max(1, Math.ceil(filas / FILAS_POR_PAGINA));
  const numero = Math.min(filtro.pagina, paginas);
  const muestra = await db.query<FilaImportacion>(
    `SELECT numero_fila, estado, datos_originales, datos_normalizados,
            problemas, entidades_confirmadas
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
  const activo = anios.find((a) => a.estado === 'ACTIVO');
  return {
    ...importacion,
    filas: total,
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
    anios,
    resumen,
    pagina: { estado: filtro.estado, numero, filas, paginas },
    muestra: muestra.rows,
    confirmacion: estadoConfirmacion(importacion.estado, opciones, resumen),
  };
}

/** Solo cambia las filas distintas, en lotes de la misma transacción. */
async function actualizarFilas(
  db: PoolClient,
  id: string,
  revisadas: FilaRevisada[],
) {
  for (let inicio = 0; inicio < revisadas.length; inicio += FILAS_POR_LOTE) {
    await db.query(
      `UPDATE convi.filas_importacion f
     SET estado = r.estado, datos_normalizados = r.datos,
         problemas = r.problemas
     FROM jsonb_to_recordset($2::jsonb)
          AS r(numero int, estado text, datos jsonb, problemas jsonb)
     WHERE f.proceso_importacion_id = $1 AND f.numero_fila = r.numero
       AND (f.estado, f.datos_normalizados, f.problemas)
           IS DISTINCT FROM (r.estado, r.datos, r.problemas)`,
      [id, JSON.stringify(revisadas.slice(inicio, inicio + FILAS_POR_LOTE))],
    );
  }
}

/**
 * "Toca" la importación: si otra persona la revisa, confirma u omite al
 * mismo tiempo, una de las dos operaciones recibe 40001 en vez de mezclarlas.
 * No cambia nada ni deja auditoría.
 */
async function bloquear(db: PoolClient, id: string) {
  const proceso = await db.query<{
    tipo_importacion: TipoImportacion;
    estado: string;
    columnas: string[];
    mapeo: Record<string, string>;
    opciones: Record<string, unknown>;
  }>(
    `UPDATE convi.procesos_importacion SET estado = estado
     WHERE id = $1
     RETURNING tipo_importacion, estado,
               coalesce(opciones_importacion->'columnas', '[]'::jsonb) AS columnas,
               mapeo_columnas AS mapeo, opciones_importacion AS opciones`,
    [id],
  );
  if (proceso.rows.length === 0)
    throw new NotFoundException('No encontramos esa importación.');
  return proceso.rows[0];
}

function exigirRevision(estado: string, accion: string) {
  if (estado === 'CARGADO')
    throw new ConflictException(`Revisa las filas antes de ${accion}.`);
  if (estado === 'PROCESANDO')
    throw new ConflictException(
      'La importación se está confirmando: espera a que termine.',
    );
  if (estado !== 'REVISION')
    throw new ConflictException(
      `La importación está ${NOMBRE_ESTADO[estado] ?? estado.toLowerCase()}: ya no se puede ${accion}.`,
    );
}

/** HU-020 CA5: Confirmada, con su fecha, solo si todas sus filas están confirmadas u omitidas. */
async function cerrarSiCorresponde(db: PoolClient, id: string) {
  await db.query(
    `UPDATE convi.procesos_importacion
     SET estado = 'CONFIRMADO', confirmado_en = now()
     WHERE id = $1 AND estado = 'REVISION'
       AND NOT EXISTS (SELECT 1 FROM convi.filas_importacion
                       WHERE proceso_importacion_id = $1
                         AND estado NOT IN ('CONFIRMADO', 'OMITIDO'))`,
    [id],
  );
}

/** Cantidad de filas de la importación por estado. */
async function contarFilas(db: PoolClient, id: string) {
  const conteo = await db.query<{ estado: EstadoFila; filas: number }>(
    `SELECT estado, count(*)::int AS filas
     FROM convi.filas_importacion
     WHERE proceso_importacion_id = $1
     GROUP BY estado`,
    [id],
  );
  return Object.fromEntries(
    ESTADOS_FILA.map((estado) => [
      estado,
      conteo.rows.find((c) => c.estado === estado)?.filas ?? 0,
    ]),
  ) as Record<EstadoFila, number>;
}

/** Las filas que la confirmación todavía tiene que procesar. */
function pendientes(
  resumen: Record<EstadoFila, number>,
  incluirAdvertencias: boolean,
) {
  return resumen.VALIDO + (incluirAdvertencias ? resumen.ADVERTENCIA : 0);
}

function numero(valor: unknown) {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

/** opciones_importacion.confirmacion, o null si la importación nunca se confirmó. */
function confirmacionGuardada(
  opciones: Record<string, unknown>,
): ConfirmacionGuardada | null {
  const guardada = objeto(opciones.confirmacion);
  if (typeof guardada.iniciada_en !== 'string') return null;
  const resultado = objeto(guardada.resultado);
  return {
    incluir_advertencias: guardada.incluir_advertencias === true,
    total: numero(guardada.total),
    iniciada_en: guardada.iniciada_en,
    confirmadas_al_iniciar: numero(guardada.confirmadas_al_iniciar),
    errores_al_iniciar: numero(guardada.errores_al_iniciar),
    con_error_al_revisar: numero(guardada.con_error_al_revisar),
    terminada_en:
      typeof guardada.terminada_en === 'string' ? guardada.terminada_en : null,
    resultado:
      guardada.resultado && typeof guardada.resultado === 'object'
        ? {
            confirmadas: numero(resultado.confirmadas),
            con_error: numero(resultado.con_error),
            sin_enviar: numero(resultado.sin_enviar),
          }
        : null,
  };
}

/** HU-020 CA5: el avance se cuenta con las filas que ya no están pendientes. */
function estadoConfirmacion(
  estado: string,
  opciones: Record<string, unknown>,
  resumen: Record<EstadoFila, number>,
): EstadoConfirmacion | null {
  const guardada = confirmacionGuardada(opciones);
  if (!guardada) return null;
  const quedan =
    estado === 'PROCESANDO'
      ? pendientes(resumen, guardada.incluir_advertencias)
      : (guardada.resultado?.sin_enviar ?? 0);
  return {
    incluir_advertencias: guardada.incluir_advertencias,
    total: guardada.total,
    procesadas: Math.max(0, guardada.total - quedan),
    iniciada_en: guardada.iniciada_en,
    terminada_en: guardada.terminada_en,
    resultado: guardada.resultado,
    en_curso: false,
  };
}

/**
 * PB-027: un tramo de la confirmación en una transacción. Toma las siguientes
 * filas pendientes y las bloquea; cada fila tiene su punto de guardado: si no
 * se puede confirmar, se deshace solo lo suyo y queda Con error. Devuelve true
 * cuando ya no hay nada más que hacer.
 */
async function confirmarTramo(
  db: PoolClient,
  supabase: SupabaseClient,
  id: string,
): Promise<boolean> {
  // CA4: si la importación ya no está Procesando (terminó o la canceló otra
  // persona), no se crea nada.
  const proceso = await bloquear(db, id);
  const guardada = confirmacionGuardada(proceso.opciones);
  if (proceso.estado !== 'PROCESANDO') return true;
  if (!guardada) {
    await terminar(db, id, null);
    return true;
  }
  const tipo = proceso.tipo_importacion;
  const c: Confirmacion = {
    db,
    supabase,
    anioId:
      typeof proceso.opciones.anio_academico_id === 'string'
        ? proceso.opciones.anio_academico_id
        : null,
    duplicados:
      proceso.opciones.duplicados === 'ERROR' ? 'ERROR' : 'USAR_EXISTENTE',
    memoria: new Map(),
  };
  const filas = await db.query<{
    id: string;
    datos_normalizados: Record<string, string | boolean | null> | null;
  }>(
    `SELECT id, datos_normalizados
     FROM convi.filas_importacion
     WHERE proceso_importacion_id = $1 AND estado = ANY($2::text[])
     ORDER BY numero_fila
     LIMIT $3
     FOR UPDATE`,
    [
      id,
      guardada.incluir_advertencias ? ['VALIDO', 'ADVERTENCIA'] : ['VALIDO'],
      tipo === 'PROFESORES' ? 1 : FILAS_POR_TRAMO,
    ],
  );
  if (filas.rows.length === 0) {
    await terminar(db, id, guardada);
    return true;
  }

  let limite = false;
  const entidadesLote =
    tipo === 'ESTUDIANTES'
      ? await confirmarEstudiantesEnLote(
          c,
          filas.rows.map((fila) => fila.datos_normalizados ?? {}),
        )
      : null;
  const confirmadas: { id: string; entidades: Entidades; principal: string }[] =
    entidadesLote
      ? filas.rows.map((fila, indice) => ({
          id: fila.id,
          entidades: entidadesLote[indice],
          principal: entidadesLote[indice].estudiante.id,
        }))
      : [];
  let puntoDeGuardado = false;
  for (const fila of entidadesLote ? [] : filas.rows) {
    // Cerrar el anterior y abrir el siguiente comparten un viaje a la base.
    await db.query(
      puntoDeGuardado
        ? 'RELEASE SAVEPOINT fila; SAVEPOINT fila'
        : 'SAVEPOINT fila',
    );
    puntoDeGuardado = true;
    try {
      const entidades = await CONFIRMAR[tipo](c, fila.datos_normalizados ?? {});
      confirmadas.push({
        id: fila.id,
        entidades,
        principal: entidades[PRINCIPAL[tipo]].id,
      });
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT fila');
      c.memoria.clear();
      if (error instanceof LimiteDeCorreos) {
        limite = true;
        break;
      }
      const problema = problemaDeError(error);
      if (!problema) throw error;
      await db.query(
        `UPDATE convi.filas_importacion
         SET estado = 'ERROR',
             problemas = coalesce(problemas, '[]'::jsonb) || $2::jsonb
         WHERE id = $1`,
        [fila.id, JSON.stringify([problema])],
      );
    }
  }
  if (puntoDeGuardado) await db.query('RELEASE SAVEPOINT fila');
  // Las confirmadas del tramo, en una sola sentencia (CA1: qué creó o reutilizó).
  await db.query(
    `UPDATE convi.filas_importacion f
     SET estado = 'CONFIRMADO', entidades_confirmadas = r.entidades,
         entidad_confirmada_id = r.principal
     FROM jsonb_to_recordset($1::jsonb) AS r(id uuid, entidades jsonb, principal uuid)
     WHERE f.id = r.id`,
    [JSON.stringify(confirmadas)],
  );
  // Con el límite de correos, las filas que faltan quedan Válidas para otro intento.
  if (limite) {
    await terminar(db, id, guardada);
    return true;
  }
  return false;
}

/**
 * HU-020 CA5: al terminar, la importación queda Confirmada con su fecha si
 * todas sus filas están confirmadas u omitidas; si no, vuelve a En revisión.
 * El resultado queda en opciones_importacion.confirmacion.
 */
async function terminar(
  db: PoolClient,
  id: string,
  guardada: ConfirmacionGuardada | null,
) {
  const resumen = await contarFilas(db, id);
  const resultado: ResultadoConfirmacion = guardada
    ? {
        confirmadas: resumen.CONFIRMADO - guardada.confirmadas_al_iniciar,
        con_error:
          guardada.con_error_al_revisar +
          (resumen.ERROR - guardada.errores_al_iniciar),
        sin_enviar: pendientes(resumen, guardada.incluir_advertencias),
      }
    : { confirmadas: 0, con_error: 0, sin_enviar: 0 };
  const cerrada =
    resumen.PENDIENTE + resumen.VALIDO + resumen.ADVERTENCIA + resumen.ERROR ===
    0;
  await db.query(
    `UPDATE convi.procesos_importacion
     SET estado = $2::text,
         confirmado_en = CASE WHEN $2::text = 'CONFIRMADO' THEN now() END,
         opciones_importacion = jsonb_set(
           opciones_importacion, '{confirmacion}',
           coalesce(opciones_importacion->'confirmacion', '{}'::jsonb) || $3::jsonb)
     WHERE id = $1`,
    [
      id,
      cerrada ? 'CONFIRMADO' : 'REVISION',
      JSON.stringify({ terminada_en: new Date().toISOString(), resultado }),
    ],
  );
}
