import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { generarEmbeddings } from '../documentos/embeddings.js';
import { ErrorPreparacion } from '../documentos/preparacion.js';
import { buscarFragmentosNormativa } from '../normativa/busqueda.js';
import {
  ErrorIA,
  MODELO_GENERACION,
  type FragmentoEncontrado,
} from '../normativa/consulta.js';
import { configuracionGeneracion, generar } from '../normativa/generacion.js';
import { movimientosDelCaso } from '../situaciones/estado-caso.js';
import {
  protocolosAplicables,
  protocolosDelCaso,
} from '../situaciones/protocolo-caso.js';
import {
  construirMensajes,
  construirReferencias,
  crearOcultador,
  esquemaOrientacion,
  interpretarOrientacion,
  pideCruzarLimite,
  rechazoPorLimite,
  textoBusqueda,
  validarSolicitud,
  type ContextoCaso,
  type Orientacion,
  type PersonaCaso,
} from './orientacion.js';

const NO_EXISTE = 'El caso no existe.';
const NO_DISPONIBLE =
  'La orientación con IA no está disponible en este momento, el caso y sus protocolos se pueden seguir usando sin ella, intenta de nuevo más tarde';

const MAXIMO_SITUACIONES = 10;
const MAXIMO_PROTOCOLOS = 5;
const FRAGMENTOS_ORIENTACION = 5;

const fecha = (valor: Date | string | null) =>
  valor === null
    ? null
    : (valor instanceof Date ? valor.toISOString() : String(valor)).slice(
        0,
        10,
      );

/**
 * PB-120 y PB-121 (HU-103): orientación con IA dentro de un caso. Junta el
 * expediente con los permisos de Convivencia (RLS por escuela y segundo factor),
 * oculta los nombres con seudónimos, busca en el reglamento publicado y le pide a
 * qwen3.5:9b hechos citados del expediente y pasos citados de la normativa. No
 * guarda la respuesta ni cambia el caso, solo registra la solicitud (HU-128).
 */
@Injectable()
export class OrientacionService {
  private readonly logger = new Logger(OrientacionService.name);
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      trabajo,
    );
  }

  async orientar(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
  ): Promise<Orientacion & { solicitud_id: string }> {
    const pregunta = validarSolicitud(cuerpo);
    const inicio = Date.now();
    const { contexto, personas, solicitudId } = await this.operar(
      sesion,
      async (db) => {
        const leido = await leerCaso(db, casoId);
        // La solicitud queda registrada antes de llamar a la IA, sin la pregunta.
        const registro = await db.query<{ id: string }>(
          `INSERT INTO convi.registros_solicitudes_ia
             (establecimiento_id, membresia_id, caso_id, codigo_proposito, nombre_modelo)
           VALUES (convi.establecimiento_actual(), convi.membresia_actual(), $1, 'SINTESIS_CASO', $2)
           RETURNING id`,
          [casoId, MODELO_GENERACION],
        );
        return { ...leido, solicitudId: registro.rows[0].id };
      },
    );
    const { seudonimos, ocultar } = crearOcultador(personas);

    // HU-104 CA2: pedir clasificar, predecir o diagnosticar no llega al modelo.
    if (pideCruzarLimite(pregunta)) {
      await this.cerrar(sesion, solicitudId, 'COMPLETADO', inicio, {
        fuentes: 0,
        resumen:
          'Orientación del caso no entregada porque la pregunta pedía clasificar, predecir o diagnosticar',
      });
      return { ...rechazoPorLimite(seudonimos), solicitud_id: solicitudId };
    }

    // La pregunta también se oculta: puede nombrar a un estudiante.
    const preguntaOculta = pregunta ? ocultar(pregunta) : null;
    let fragmentos: FragmentoEncontrado[] = [];
    try {
      configuracionGeneracion();
      const [vector] = await generarEmbeddings([
        {
          indice: 0,
          contenido: textoBusqueda(contexto, preguntaOculta, ocultar),
          pagina_desde: null,
          pagina_hasta: null,
        },
      ]);
      fragmentos = await this.operar(sesion, (db) =>
        buscarFragmentosNormativa(db, vector, FRAGMENTOS_ORIENTACION),
      );
      const referencias = construirReferencias(contexto, fragmentos, ocultar);
      const orientacion = interpretarOrientacion(
        await generar(
          construirMensajes(referencias, seudonimos, preguntaOculta),
          esquemaOrientacion(referencias),
        ),
        referencias,
        seudonimos,
        preguntaOculta !== null,
      );
      const fuentes = orientacion.referencias.filter(
        (r) => r.tipo !== 'EXPEDIENTE',
      ).length;
      await this.cerrar(sesion, solicitudId, 'COMPLETADO', inicio, {
        fuentes,
        resumen: `Orientación del caso ${preguntaOculta ? `con pregunta puntual${orientacion.respuesta ? ' respondida' : ' sin respuesta directa'}` : 'general'}, ${orientacion.hechos.length} hechos y ${orientacion.pasos.length} pasos citados, ${fragmentos.length} fragmentos y ${contexto.protocolos.length} protocolos disponibles${orientacion.descartados ? `, ${orientacion.descartados} elementos descartados por cruzar los límites` : ''}${orientacion.sin_disposicion ? ', sin pasos de la normativa' : ''}`,
      });
      return { ...orientacion, solicitud_id: solicitudId };
    } catch (error) {
      if (!(error instanceof ErrorIA) && !(error instanceof ErrorPreparacion))
        throw error;
      // HU-128: el registro dice qué falló, sin el expediente ni la pregunta.
      const motivo =
        error instanceof Error ? error.message : 'Error del servicio de IA';
      this.logger.warn(`Falló la orientación del caso ${solicitudId}`);
      await this.cerrar(sesion, solicitudId, 'FALLIDO', inicio, {
        fuentes: 0,
        resumen: `Orientación del caso fallida con ${fragmentos.length} fragmentos encontrados: ${motivo}`,
      }).catch(() => {});
      throw new ServiceUnavailableException(NO_DISPONIBLE);
    }
  }

  private cerrar(
    sesion: Sesion,
    id: string,
    estado: 'COMPLETADO' | 'FALLIDO',
    inicio: number,
    datos: { fuentes: number; resumen: string },
  ) {
    return this.operar(sesion, (db) =>
      db.query(
        `UPDATE convi.registros_solicitudes_ia
         SET estado = $2, completado_en = now(), latencia_ms = $3,
             cantidad_fuentes = $4, resumen_sin_datos_sensibles = $5
         WHERE id = $1 AND estado = 'INICIADA'`,
        [
          id,
          estado,
          Date.now() - inicio,
          datos.fuentes,
          datos.resumen.slice(0, 500),
        ],
      ),
    );
  }
}

/** Lee el expediente con la sesión de Convivencia: la RLS ya separa por escuela. */
async function leerCaso(
  db: PoolClient,
  casoId: string,
): Promise<{ contexto: ContextoCaso; personas: PersonaCaso[] }> {
  const caso = (
    await db.query<ContextoCaso['caso']>(
      `SELECT c.id, c.codigo, c.resumen, c.estado_actual, cat.nombre AS categoria,
              c.fecha_inicio::text AS fecha_inicio,
              c.fecha_limite_cierre::text AS fecha_limite_cierre
       FROM convi.casos c
       LEFT JOIN convi.categorias_convivencia cat ON cat.id = c.categoria_principal_id
       WHERE c.id = $1`,
      [casoId],
    )
  ).rows[0];
  if (!caso) throw new NotFoundException(NO_EXISTE);

  // Personas del caso y de sus situaciones, para ocultar sus nombres.
  const personas = await db.query<PersonaCaso>(
    `SELECT DISTINCT ON (p.id) p.id AS persona_id, p.nombres, p.apellidos,
            (e.id IS NOT NULL) AS es_estudiante, pa.rol_contextual AS rol,
            cm.nombre AS curso, (pa.caso_id IS NOT NULL) AS en_caso
     FROM convi.participaciones pa
     JOIN convi.personas p ON p.id = pa.persona_id
     LEFT JOIN convi.estudiantes e ON e.persona_id = p.id
     LEFT JOIN convi.matriculas mt ON mt.id = pa.matricula_contexto_id
     LEFT JOIN convi.cursos cm ON cm.id = mt.curso_id
     WHERE pa.activo_hasta IS NULL
       AND (pa.caso_id = $1
            OR pa.situacion_id IN (SELECT id FROM convi.situaciones WHERE caso_id = $1))
     ORDER BY p.id, (pa.caso_id IS NULL)`,
    [casoId],
  );
  // Primero los del caso y los estudiantes, para que los seudónimos sean estables.
  const ordenadas = personas.rows.sort(
    (a, b) =>
      Number(b.en_caso) - Number(a.en_caso) ||
      Number(b.es_estudiante) - Number(a.es_estudiante) ||
      `${a.apellidos} ${a.nombres}`.localeCompare(
        `${b.apellidos} ${b.nombres}`,
        'es',
      ),
  );

  const situaciones = (
    await db.query<ContextoCaso['situaciones'][number]>(
      `SELECT s.id, s.codigo, s.ocurrido_en::date::text AS fecha, s.lugar,
              cat.nombre AS categoria, s.descripcion
       FROM convi.situaciones s
       LEFT JOIN convi.categorias_convivencia cat ON cat.id = s.categoria_id
       WHERE s.caso_id = $1
       ORDER BY s.ocurrido_en DESC, s.codigo DESC
       LIMIT $2`,
      [casoId, MAXIMO_SITUACIONES],
    )
  ).rows.reverse();

  const pasos = (await protocolosDelCaso(db, casoId)).flatMap((p) =>
    p.pasos.map((paso) => ({
      protocolo: p.protocolo,
      orden: paso.orden_paso,
      nombre: paso.nombre,
      estado: paso.estado,
      vence: fecha(paso.vence_en),
    })),
  );

  const compromisos = (
    await db.query<ContextoCaso['compromisos'][number]>(
      `SELECT descripcion, estado, vence_en::date::text AS vence
       FROM convi.compromisos
       WHERE caso_id = $1
       ORDER BY estado IN ('COMPLETADO', 'CANCELADO'), vence_en NULLS LAST
       LIMIT 6`,
      [casoId],
    )
  ).rows;

  const actuaciones = (
    await db.query<ContextoCaso['actuaciones'][number]>(
      `SELECT tipo_actuacion AS tipo, estado,
              coalesce(realizado_en, programado_en)::date::text AS fecha,
              objetivo, resultado
       FROM convi.actuaciones
       WHERE caso_id = $1
       ORDER BY coalesce(realizado_en, programado_en) DESC NULLS LAST
       LIMIT 6`,
      [casoId],
    )
  ).rows.reverse();

  const movimientos = (await movimientosDelCaso(db, casoId))
    .slice(-5)
    .map((m) => ({
      estado: m.estado_nuevo,
      fecha: fecha(m.cambiado_en) ?? '',
      motivo: m.motivo,
    }));

  const disponibles = (await protocolosAplicables(db)).slice(
    0,
    MAXIMO_PROTOCOLOS,
  );
  const pasosOficiales = disponibles.length
    ? (
        await db.query<{ version_protocolo_id: string; nombre: string }>(
          `SELECT version_protocolo_id, nombre
           FROM convi.pasos_protocolo
           WHERE version_protocolo_id = ANY($1::uuid[])
           ORDER BY version_protocolo_id, orden_paso`,
          [disponibles.map((d) => d.id)],
        )
      ).rows
    : [];
  const protocolos = disponibles.map((d) => ({
    version_id: d.id,
    nombre: d.nombre,
    pasos: pasosOficiales
      .filter((p) => p.version_protocolo_id === d.id)
      .slice(0, 12)
      .map((p) => p.nombre),
  }));

  return {
    contexto: {
      caso,
      situaciones,
      pasos,
      compromisos,
      actuaciones,
      movimientos,
      protocolos,
    },
    personas: ordenadas,
  };
}
