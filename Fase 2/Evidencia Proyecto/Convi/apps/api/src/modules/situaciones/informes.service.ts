import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { rechazoPublicado } from '../../common/publicado.js';
import type { Sesion } from '../../common/sesion.js';
import {
  CuentaService,
  type AccesoRegistro,
} from '../../database/cuenta.service.js';
import { ALMACENAMIENTO } from './evidencias.service.js';
import {
  OPCIONES_INDICADORES,
  validarFiltrosIndicadores,
} from './indicadores.js';
import {
  DEFINICIONES_INDICADORES,
  leerIndicadores,
} from './calculo-indicadores.js';
import {
  hallazgosInforme,
  identificadorInforme,
  seccionesDelInforme,
  seccionesIndicadores,
  validarAlcanceInforme,
  validarPresentacionInforme,
  type AlcanceInforme,
  type InstantaneaInforme,
  type SeccionInforme,
} from './informe.js';
import { generarPdfInforme, generarXlsxInforme } from './informe-archivos.js';

const ACCESO: AccesoRegistro = {
  tipo: 'establecimiento',
  perfiles: ['CONVIVENCIA'],
};
const ESPACIO = 'convi-privado';
type Guardado = {
  id: string;
  estado: 'BORRADOR' | 'PUBLICADO';
  creado_por: string;
  informe_anterior_id: string | null;
  publicado_en: string | null;
  definiciones_calculo: InstantaneaInforme;
};
const COLUMNAS =
  'id,estado,creado_por,informe_anterior_id,publicado_en,definiciones_calculo';
const MAXIMO_DETALLES = 2000;

@Injectable()
export class InformesService {
  private readonly logger = new Logger(InformesService.name);
  constructor(
    @Inject(CuentaService) private readonly cuentas: CuentaService,
    @Inject(ALMACENAMIENTO) private readonly storage: SupabaseClient,
  ) {}

  opciones(sesion: Sesion) {
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const { rows } = await db.query(OPCIONES_INDICADORES);
      const niveles = await db.query(
        'SELECT id,nombre FROM convi.niveles_educativos ORDER BY orden,id',
      );
      const hoy = (
        await db.query<{ hoy: string }>('SELECT current_date::text hoy')
      ).rows[0].hoy;
      return { ...rows[0].opciones, niveles: niveles.rows, hoy };
    });
  }

  buscar(sesion: Sesion, entrada: Record<string, unknown>) {
    const f = validarFiltrosIndicadores(entrada);
    if (!f.desde || !f.hasta)
      throw new BadRequestException('Selecciona ambas fechas antes de buscar');
    const buscar =
      typeof entrada.buscar === 'string' ? entrada.buscar.trim() : '';
    if (
      buscar.length < 2 ||
      buscar.length > 120 ||
      !['ESTUDIANTE', 'CASO'].includes(entrada.tipo as string)
    )
      throw new BadRequestException(
        'Escribe al menos dos caracteres del nombre o código',
      );
    const pagina = Number(entrada.pagina ?? 1);
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 10000)
      throw new BadRequestException('Página no válida');
    const texto = '%' + buscar.replace(/[\\%_]/g, '\\$&') + '%';
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const { rows } = await db.query<{ id: string; nombre: string }>(
        entrada.tipo === 'ESTUDIANTE'
          ? `SELECT e.id,p.apellidos || ', ' || p.nombres || ' · ' || e.codigo_estudiante nombre
            FROM convi.estudiantes e JOIN convi.personas p ON p.id=e.persona_id
            WHERE p.nombres || ' ' || p.apellidos ILIKE $1 OR p.apellidos || ' ' || p.nombres ILIKE $1 OR e.codigo_estudiante ILIKE $1
            ORDER BY p.apellidos,p.nombres,e.id LIMIT 21 OFFSET $2`
          : `SELECT id,codigo || ' · ' || titulo nombre FROM convi.casos
            WHERE codigo ILIKE $1 OR titulo ILIKE $1 ORDER BY codigo,id LIMIT 21 OFFSET $2`,
        [texto, (pagina - 1) * 20],
      );
      return {
        registros: rows.slice(0, 20),
        pagina,
        hay_mas: rows.length > 20,
      };
    });
  }

  preparar(sesion: Sesion, entrada: unknown) {
    const alcance = validarAlcanceInforme(entrada);
    const acceso: AccesoRegistro = alcance.estudiante
      ? {
          tipo: 'estudiante',
          id: alcance.estudiante,
          perfiles: ['CONVIVENCIA'],
        }
      : alcance.caso
        ? { tipo: 'caso', id: alcance.caso, perfiles: ['CONVIVENCIA'] }
        : ACCESO;
    return this.cuentas.operar(
      sesion,
      acceso,
      async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          alcance.solicitud,
        ]);
        const existente = (
          await db.query<Guardado>(
            `SELECT ${COLUMNAS} FROM convi.informes WHERE id=$1`,
            [alcance.solicitud],
          )
        ).rows[0];
        if (existente) {
          const previo = existente.definiciones_calculo.alcance;
          if (
            existente.creado_por !== sesion.membresia_id ||
            Object.entries(alcance).some(
              ([k, v]) => previo[k as keyof AlcanceInforme] !== v,
            )
          )
            throw new ConflictException(
              'Esta solicitud ya corresponde a otro informe, inicia uno nuevo',
            );
          return { id: existente.id };
        }
        if (alcance.anterior) {
          const anterior = (
            await db.query(
              "SELECT id FROM convi.informes WHERE id=$1 AND estado='PUBLICADO' FOR SHARE",
              [alcance.anterior],
            )
          ).rows[0];
          if (!anterior)
            throw new BadRequestException(
              'La edición anterior debe ser un informe publicado de tu escuela',
            );
        }
        const indicadores = await leerIndicadores(db, alcance, alcance);
        const contexto = (
          await db.query<{
            escuela: string;
            creador: string;
            creado_en: string;
          }>(
            `SELECT e.nombre escuela,p.nombres || ' ' || p.apellidos creador,current_timestamp::text creado_en
         FROM convi.establecimientos e JOIN convi.membresias_establecimiento m ON m.id=convi.membresia_actual()
         JOIN convi.personas p ON p.id=m.persona_id WHERE e.id=convi.establecimiento_actual()`,
          )
        ).rows[0];
        let sujeto: string | null = null;
        const secciones = seccionesIndicadores(indicadores);
        if (alcance.estudiante) {
          sujeto =
            (
              await db.query<{ nombre: string }>(
                `SELECT p.nombres || ' ' || p.apellidos || ' · ' || e.codigo_estudiante nombre
          FROM convi.estudiantes e JOIN convi.personas p ON p.id=e.persona_id WHERE e.id=$1`,
                [alcance.estudiante],
              )
            ).rows[0]?.nombre ?? null;
        } else if (alcance.caso) {
          sujeto =
            (
              await db.query<{ nombre: string }>(
                "SELECT codigo || ' · ' || titulo nombre FROM convi.casos WHERE id=$1",
                [alcance.caso],
              )
            ).rows[0]?.nombre ?? null;
        }
        if (alcance.tipo !== 'PERIODO')
          secciones.push(...(await this.detalles(db, alcance)));
        const filtros_texto = [
          'Propósito ' +
            {
              PERIODO: 'Análisis del período',
              ESTUDIANTE: 'Trayectoria de estudiante',
              CASO: 'Detalle de caso',
            }[alcance.tipo],
          'Curso ' +
            (indicadores.opciones.cursos.find((c) => c.id === alcance.curso)
              ?.nombre ?? 'Todos'),
          'Categoría ' +
            (indicadores.opciones.categorias.find(
              (c) => c.id === alcance.categoria,
            )?.nombre ?? 'Todas'),
        ];
        if (alcance.nivel) {
          const n = (
            await db.query<{ nombre: string }>(
              'SELECT nombre FROM convi.niveles_educativos WHERE id=$1',
              [alcance.nivel],
            )
          ).rows[0];
          if (!n)
            throw new BadRequestException(
              'El nivel educativo no corresponde a tu escuela',
            );
          filtros_texto.push('Nivel educativo ' + n.nombre);
        }
        if (
          (alcance.curso &&
            !indicadores.opciones.cursos.some((c) => c.id === alcance.curso)) ||
          (alcance.categoria &&
            !indicadores.opciones.categorias.some(
              (c) => c.id === alcance.categoria,
            ))
        )
          throw new BadRequestException(
            'El curso o la categoría no corresponde a una opción disponible',
          );
        if (sujeto) filtros_texto.push('Registro seleccionado ' + sujeto);
        if (alcance.estudiante)
          filtros_texto.push(
            'Situaciones y casos con participación vigente del estudiante, las actuaciones detalladas incluyen solo aquellas con participación vigente explícita, sin fichas de otros estudiantes',
          );
        const titulo =
          alcance.tipo === 'PERIODO'
            ? 'Informe de convivencia del período'
            : alcance.tipo === 'ESTUDIANTE'
              ? 'Informe de trayectoria del estudiante'
              : 'Informe del caso';
        const instantanea: InstantaneaInforme = {
          version: 1,
          ...contexto,
          sujeto,
          alcance,
          filtros_texto,
          indicadores,
          definiciones: DEFINICIONES_INDICADORES,
          secciones,
          hallazgos: hallazgosInforme(indicadores),
          presentacion: {
            titulo,
            subtitulo: '',
            comentarios: '',
            tema: 'azul',
            portada: true,
            tablas: true,
            agrupacion: 'mes',
            hallazgos_omitidos: [],
            secciones: secciones
              .filter((s) =>
                (alcance.tipo === 'PERIODO'
                  ? [
                      'resumen',
                      'evolucion_mes',
                      'categorias',
                      'niveles',
                      'categorias_mes',
                      'comparacion',
                    ]
                  : alcance.tipo === 'ESTUDIANTE'
                    ? [
                        'resumen',
                        'evolucion_mes',
                        'categorias',
                        'actividad',
                        'situaciones_detalle',
                        'casos_detalle',
                        'actuaciones_detalle',
                      ]
                    : [
                        'resumen',
                        'actividad',
                        'situaciones_detalle',
                        'casos_detalle',
                        'actuaciones_detalle',
                      ]
                ).includes(s.id),
              )
              .map((s) => s.id),
          },
        };
        await db.query(
          `INSERT INTO convi.informes(id,establecimiento_id,titulo,periodo_desde,periodo_hasta,filtros,definiciones_calculo,creado_por,informe_anterior_id)
        VALUES($1,convi.establecimiento_actual(),$2,$3,$4,$5,$6,convi.membresia_actual(),$7)`,
          [
            alcance.solicitud,
            titulo,
            alcance.desde,
            alcance.hasta,
            JSON.stringify(alcance),
            JSON.stringify(instantanea),
            alcance.anterior,
          ],
        );
        return { id: alcance.solicitud };
      },
      'READ COMMITTED',
    );
  }

  private async detalles(
    db: PoolClient,
    a: AlcanceInforme,
  ): Promise<SeccionInforme[]> {
    const valores = [a.desde, a.hasta, a.estudiante, a.caso];
    const situaciones = (
      await db.query<{
        codigo: string;
        fecha: string;
        categoria: string;
        descripcion: string;
        caso: string;
      }>(
        `SELECT s.codigo,s.ocurrido_en::date::text fecha,coalesce(cat.nombre,'Sin especificar') categoria,s.descripcion,coalesce(c.codigo,'Sin caso') caso
       FROM convi.situaciones s LEFT JOIN convi.categorias_convivencia cat ON cat.id=s.categoria_id
       LEFT JOIN convi.casos c ON c.id=s.caso_id
       WHERE s.ocurrido_en >= $1::date::timestamptz AND s.ocurrido_en < ($2::date+1)::timestamptz
         AND ($4::uuid IS NULL OR s.caso_id=$4::uuid)
         AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM convi.participaciones pa JOIN convi.estudiantes e ON e.persona_id=pa.persona_id
           WHERE e.id=$3::uuid AND pa.situacion_id=s.id AND pa.activo_hasta IS NULL))
       ORDER BY s.ocurrido_en,s.id LIMIT ${MAXIMO_DETALLES + 1}`,
        valores,
      )
    ).rows;
    const actuaciones = (
      await db.query<{
        codigo: string;
        fecha: string;
        tipo: string;
        estado: string;
        detalle: string;
        asistencia: string;
      }>(
        `SELECT c.codigo,coalesce(a.realizado_en,a.programado_en,a.creado_en)::date::text fecha,a.tipo_actuacion tipo,a.estado,
         concat_ws(E'\\n',a.objetivo,a.descripcion,a.resultado,a.proxima_accion) detalle,
         coalesce((SELECT string_agg(DISTINCT pa.estado_asistencia,', ') FROM convi.participaciones pa
           JOIN convi.estudiantes e ON e.persona_id=pa.persona_id WHERE e.id=$3::uuid AND pa.actuacion_id=a.id AND pa.activo_hasta IS NULL),'No corresponde o sin registro') asistencia
       FROM convi.actuaciones a JOIN convi.casos c ON c.id=a.caso_id
       WHERE coalesce(a.realizado_en,a.programado_en,a.creado_en) >= $1::date::timestamptz
         AND coalesce(a.realizado_en,a.programado_en,a.creado_en) < ($2::date+1)::timestamptz
         AND ($4::uuid IS NULL OR a.caso_id=$4::uuid)
         AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM convi.participaciones pa JOIN convi.estudiantes e ON e.persona_id=pa.persona_id
           WHERE e.id=$3::uuid AND pa.actuacion_id=a.id AND pa.activo_hasta IS NULL))
       ORDER BY coalesce(a.realizado_en,a.programado_en,a.creado_en),a.id LIMIT ${MAXIMO_DETALLES + 1}`,
        valores,
      )
    ).rows;
    const casos = (
      await db.query<{
        codigo: string;
        titulo: string;
        fecha: string;
        estado_actual: string;
        resumen: string;
      }>(
        `SELECT c.codigo,c.titulo,c.fecha_inicio::text fecha,c.estado_actual,c.resumen FROM convi.casos c
       WHERE ($4::uuid IS NULL OR c.id=$4::uuid) AND ($3::uuid IS NULL OR
         EXISTS(SELECT 1 FROM convi.participaciones pa JOIN convi.estudiantes e ON e.persona_id=pa.persona_id
           WHERE e.id=$3::uuid AND pa.caso_id=c.id AND pa.activo_hasta IS NULL) OR
         EXISTS(SELECT 1 FROM convi.situaciones s JOIN convi.participaciones pa ON pa.situacion_id=s.id
           JOIN convi.estudiantes e ON e.persona_id=pa.persona_id WHERE s.caso_id=c.id AND e.id=$3::uuid AND pa.activo_hasta IS NULL))
       AND ($4::uuid IS NOT NULL OR c.fecha_inicio BETWEEN $1::date AND $2::date OR
         EXISTS(SELECT 1 FROM convi.situaciones s JOIN convi.participaciones pa ON pa.situacion_id=s.id
           JOIN convi.estudiantes e ON e.persona_id=pa.persona_id WHERE s.caso_id=c.id AND e.id=$3::uuid AND pa.activo_hasta IS NULL
           AND s.ocurrido_en >= $1::date::timestamptz AND s.ocurrido_en < ($2::date+1)::timestamptz) OR
         EXISTS(SELECT 1 FROM convi.actuaciones ac JOIN convi.participaciones pa ON pa.actuacion_id=ac.id
           JOIN convi.estudiantes e ON e.persona_id=pa.persona_id WHERE ac.caso_id=c.id AND e.id=$3::uuid AND pa.activo_hasta IS NULL
           AND coalesce(ac.realizado_en,ac.programado_en,ac.creado_en) >= $1::date::timestamptz
           AND coalesce(ac.realizado_en,ac.programado_en,ac.creado_en) < ($2::date+1)::timestamptz))
       ORDER BY c.fecha_inicio,c.id LIMIT ${MAXIMO_DETALLES + 1}`,
        valores,
      )
    ).rows;
    if (
      [situaciones, actuaciones, casos].some((f) => f.length > MAXIMO_DETALLES)
    )
      throw new BadRequestException(
        'El detalle supera 2000 registros por sección, acota el período para obtener un informe completo',
      );
    const tipos = [...new Set(actuaciones.map((f) => f.tipo))].sort();
    return [
      {
        id: 'actividad',
        titulo: 'Entrevistas y otras actuaciones',
        descripcion:
          'Fecha realizada, si no existe usa la programada y después la de creación, asistencia del estudiante cuando corresponde',
        columnas: [
          'Tipo',
          'Realizadas',
          'Planificadas o pospuestas',
          'Canceladas',
        ],
        filas: tipos.map((t) => [
          t,
          actuaciones.filter((f) => f.tipo === t && f.estado === 'REALIZADA')
            .length,
          actuaciones.filter(
            (f) =>
              f.tipo === t && ['PLANIFICADA', 'POSPUESTA'].includes(f.estado),
          ).length,
          actuaciones.filter((f) => f.tipo === t && f.estado === 'CANCELADA')
            .length,
        ]),
        grafico: null,
      },
      {
        id: 'situaciones_detalle',
        titulo: 'Detalle de situaciones',
        descripcion:
          'Situaciones ocurridas en el período, antecedentes descriptivos del registro',
        columnas: [
          'Código',
          'Fecha del hecho',
          'Categoría',
          'Caso',
          'Descripción',
        ],
        filas: situaciones.map((f) => [
          f.codigo,
          f.fecha,
          f.categoria,
          f.caso,
          f.descripcion,
        ]),
        grafico: null,
      },
      {
        id: 'casos_detalle',
        titulo: 'Casos relacionados',
        descripcion:
          'Caso elegido o casos relacionados con inicio o actividad del estudiante en el período, estado y resumen actuales al corte',
        columnas: ['Código', 'Inicio', 'Título', 'Estado al corte', 'Resumen'],
        filas: casos.map((f) => [
          f.codigo,
          f.fecha,
          f.titulo,
          f.estado_actual,
          f.resumen,
        ]),
        grafico: null,
      },
      {
        id: 'actuaciones_detalle',
        titulo: 'Detalle de actuaciones',
        descripcion:
          'No constituye acta firmada, incluye las actuaciones dentro del período y alcance seleccionados',
        columnas: [
          'Caso',
          'Fecha',
          'Tipo',
          'Estado',
          'Asistencia',
          'Antecedentes y resultado',
        ],
        filas: actuaciones.map((f) => [
          f.codigo,
          f.fecha,
          f.tipo,
          f.estado,
          f.asistencia,
          f.detalle,
        ]),
        grafico: null,
      },
    ];
  }

  listar(sesion: Sesion, pagina: unknown) {
    const p = Number(pagina ?? 1);
    if (!Number.isInteger(p) || p < 1 || p > 10000)
      throw new BadRequestException('Página no válida');
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const { rows } = await db.query(
        `SELECT id,titulo,estado,periodo_desde::text,periodo_hasta::text,creado_en,publicado_en
        FROM convi.informes WHERE estado='PUBLICADO' OR creado_por=convi.membresia_actual()
        ORDER BY creado_en DESC,id LIMIT 21 OFFSET $1`,
        [(p - 1) * 20],
      );
      return {
        informes: rows.slice(0, 20),
        pagina: p,
        hay_mas: rows.length > 20,
      };
    });
  }
  private async leer(
    db: PoolClient,
    sesion: Sesion,
    id: string,
    bloquear = false,
  ): Promise<Guardado> {
    identificadorInforme(id, true);
    const informe = (
      await db.query<Guardado>(
        `SELECT ${COLUMNAS} FROM convi.informes WHERE id=$1${bloquear ? ' FOR UPDATE' : ''}`,
        [id],
      )
    ).rows[0];
    if (
      !informe ||
      (informe.estado === 'BORRADOR' &&
        informe.creado_por !== sesion.membresia_id)
    )
      throw new NotFoundException(
        'El informe no está disponible para esta cuenta',
      );
    if (informe.definiciones_calculo.version !== 1)
      throw new ConflictException(
        'Este informe usa una versión que no puede editarse con este creador',
      );
    if (informe.estado === 'BORRADOR') {
      for (const seccion of informe.definiciones_calculo.secciones)
        if (seccion.id === 'evolucion_mes') seccion.grafico = 'barras';
    }
    return informe;
  }
  detalle(sesion: Sesion, id: string) {
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const informe = await this.leer(db, sesion, id);
      return {
        ...informe,
        revision: createHash('sha256')
          .update(JSON.stringify(informe.definiciones_calculo))
          .digest('hex'),
        secciones_elegidas: seccionesDelInforme(informe.definiciones_calculo),
      };
    });
  }
  guardar(sesion: Sesion, id: string, entrada: unknown) {
    return this.cuentas.operar(
      sesion,
      ACCESO,
      async (db) => {
        const informe = await this.leer(db, sesion, id, true);
        if (informe.estado !== 'BORRADOR')
          throw new ConflictException(
            'El informe publicado se conserva, crea una nueva edición',
          );
        const snapshot = informe.definiciones_calculo;
        const revision = (entrada as { revision?: unknown } | null)?.revision;
        if (
          typeof revision !== 'string' ||
          createHash('sha256')
            .update(JSON.stringify(snapshot))
            .digest('hex') !== revision
        )
          throw new ConflictException(
            'El borrador cambió en otra pestaña, recarga antes de guardar',
          );
        snapshot.presentacion = validarPresentacionInforme(
          entrada,
          snapshot.secciones
            .filter((s) => s.id !== 'evolucion_dia')
            .map((s) => s.id),
          snapshot.hallazgos.length,
        );
        await db.query(
          'UPDATE convi.informes SET titulo=$2,definiciones_calculo=$3 WHERE id=$1',
          [id, snapshot.presentacion.titulo, JSON.stringify(snapshot)],
        );
        return { id };
      },
      'READ COMMITTED',
    );
  }

  async publicar(sesion: Sesion, id: string, entrada: unknown) {
    const revision = (entrada as { revision?: unknown } | null)?.revision;
    if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision))
      throw new BadRequestException('Revisa el informe antes de publicarlo');
    const intentados: string[] = [];
    try {
      return await this.cuentas.operar(
        sesion,
        ACCESO,
        async (db) => {
          const informe = await this.leer(db, sesion, id, true);
          if (informe.estado === 'PUBLICADO') return { id };
          if (informe.creado_por !== sesion.membresia_id)
            throw new ForbiddenException(
              'Solo quien preparó el informe puede publicarlo',
            );
          const snapshot = informe.definiciones_calculo;
          if (
            createHash('sha256')
              .update(JSON.stringify(snapshot))
              .digest('hex') !== revision
          )
            throw new ConflictException(
              'El contenido cambió desde tu revisión, vuelve a revisar antes de publicar',
            );
          const pdf = await generarPdfInforme(snapshot);
          const xlsx = await generarXlsxInforme(snapshot);
          const archivos: Record<string, string> = {};
          for (const [formato, contenido, mime] of [
            ['pdf', pdf, 'application/pdf'],
            [
              'xlsx',
              xlsx,
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ],
          ] as const) {
            const clave = `${sesion.establecimiento_id}/informes/${id}/${randomUUID()}.${formato}`;
            intentados.push(clave);
            const { error } = await this.storage.storage
              .from(ESPACIO)
              .upload(clave, contenido, { contentType: mime, upsert: false });
            if (error)
              throw new ServiceUnavailableException(
                'No pudimos conservar los archivos, el borrador sigue disponible para reintentar',
              );
            const archivo = (
              await db.query<{ id: string }>(
                `INSERT INTO convi.archivos(establecimiento_id,clave_almacenamiento,nombre_original,tipo_mime,tamano_bytes,sha256,subido_por)
            VALUES(convi.establecimiento_actual(),$1,$2,$3,$4,$5,convi.membresia_actual()) RETURNING id`,
                [
                  clave,
                  'informe-convi.' + formato,
                  mime,
                  contenido.length,
                  createHash('sha256').update(contenido).digest('hex'),
                ],
              )
            ).rows[0];
            archivos[formato] = archivo.id;
          }
          snapshot.archivos = { pdf: archivos.pdf, xlsx: archivos.xlsx };
          await db.query(
            `UPDATE convi.informes SET archivo_id=$2,definiciones_calculo=$3,estado='PUBLICADO',publicado_en=current_timestamp WHERE id=$1`,
            [id, archivos.pdf, JSON.stringify(snapshot)],
          );
          return { id };
        },
        'READ COMMITTED',
      );
    } catch (error) {
      if (intentados.length) {
        try {
          const existentes = await this.cuentas.operar(
            sesion,
            ACCESO,
            async (db) =>
              (
                await db.query<{ clave_almacenamiento: string }>(
                  'SELECT clave_almacenamiento FROM convi.archivos WHERE clave_almacenamiento=ANY($1::text[])',
                  [intentados],
                )
              ).rows.map((f) => f.clave_almacenamiento),
          );
          const retirar = intentados.filter((c) => !existentes.includes(c));
          if (retirar.length) {
            const { error: fallo } = await this.storage.storage
              .from(ESPACIO)
              .remove(retirar);
            if (fallo) throw fallo;
          }
        } catch {
          this.logger.error('No se pudo conciliar una publicación de informe');
        }
      }
      throw rechazoPublicado(
        error,
        'El informe publicado se conserva, crea una nueva edición',
      );
    }
  }

  descargar(sesion: Sesion, id: string, formato: string) {
    if (!['pdf', 'xlsx'].includes(formato))
      throw new BadRequestException('Formato no disponible');
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const informe = await this.leer(db, sesion, id);
      const snapshot = informe.definiciones_calculo;
      const mime =
        formato === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      let contenido: Buffer;
      if (informe.estado === 'PUBLICADO') {
        const archivoId = snapshot.archivos?.[formato as 'pdf' | 'xlsx'];
        const archivo = (
          await db.query<{
            clave_almacenamiento: string;
            sha256: string;
            tamano_bytes: string;
          }>(
            'SELECT clave_almacenamiento,sha256,tamano_bytes FROM convi.archivos WHERE id=$1',
            [archivoId],
          )
        ).rows[0];
        if (!archivo)
          throw new NotFoundException(
            'El archivo conservado no está disponible',
          );
        const { data, error } = await this.storage.storage
          .from(ESPACIO)
          .download(archivo.clave_almacenamiento);
        if (error || !data)
          throw new ServiceUnavailableException(
            'No pudimos recuperar el archivo conservado, inténtalo nuevamente',
          );
        contenido = Buffer.from(await data.arrayBuffer());
        if (
          contenido.length !== Number(archivo.tamano_bytes) ||
          createHash('sha256').update(contenido).digest('hex') !==
            archivo.sha256
        )
          throw new ServiceUnavailableException(
            'El archivo no pasó la comprobación de integridad',
          );
      } else
        contenido =
          formato === 'pdf'
            ? await generarPdfInforme(snapshot)
            : await generarXlsxInforme(snapshot);
      return { nombre: 'informe-convi.' + formato, mime, contenido };
    });
  }
}
