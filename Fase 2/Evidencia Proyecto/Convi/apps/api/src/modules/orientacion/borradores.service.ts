import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { ErrorIA, MODELO_GENERACION } from '../normativa/consulta.js';
import { configuracionGeneracion, generar } from '../normativa/generacion.js';
import {
  BorradorRechazado,
  contextoBorrador,
  ESQUEMA_BORRADOR,
  interpretarBorrador,
  mensajesBorrador,
  validarEdicionBorrador,
  validarRevisionBorrador,
  validarSolicitudBorrador,
  type ActuacionBorrador,
  type CifrasCaso,
  type TipoBorrador,
} from './borradores.js';
import { crearOcultador, type PersonaCaso } from './orientacion.js';
import { leerCaso } from './orientacion.service.js';

const NO_EXISTE = 'El borrador no existe.';
const NO_DISPONIBLE =
  'La IA no está disponible en este momento, puedes redactar el documento a mano e intentarlo con IA más tarde';
const DESACTUALIZADO =
  'Otra persona cambió el borrador mientras lo mirabas, recarga la página para verlo antes de continuar';
const YA_REVISADO =
  'El borrador ya fue revisado o descartado, su revisión se conserva y no se cambia';
const HAY_EDICION =
  'Este borrador ya tiene una edición más nueva, revisa o edita esa edición';
// El esquema exige que la solicitud de IA sea del mismo autor (validar_ampliaciones).
const SOLO_AUTOR =
  'Solo quien pidió el borrador a la IA puede crear una nueva edición, el resto del equipo puede revisarlo o descartarlo';

export type BorradorCaso = {
  id: string;
  tipo: TipoBorrador;
  titulo: string;
  contenido: string;
  estado: 'BORRADOR' | 'REVISADO' | 'DESCARTADO';
  actuacion: string | null;
  creado_por: string;
  creado_en: string;
  revisado_por: string | null;
  revisado_en: string | null;
  borrador_anterior_id: string | null;
  edicion: number;
  /** Hay una edición más nueva de este borrador. */
  reemplazado: boolean;
  propio: boolean;
  version: string;
};

export type ActuacionElegible = {
  id: string;
  tipo: string;
  estado: string;
  fecha: string | null;
  objetivo: string;
};

/**
 * PB-125 y PB-126 (HU-106 y HU-107): borradores de acta y de informe de caso
 * con IA, solo para Convivencia activa con segundo factor. Se guardan en
 * borradores_documentales_ia pendientes de revisión: nunca son un acta firmada,
 * no se agregan como evidencia ni se publican ni se envían.
 */
@Injectable()
export class BorradoresService {
  private readonly logger = new Logger(BorradoresService.name);
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      trabajo,
    );
  }

  // Borradores del caso, del más nuevo al más antiguo, y las actuaciones que
  // se pueden elegir para un acta, en una consulta.
  listar(
    sesion: Sesion,
    casoId: string,
  ): Promise<{
    borradores: BorradorCaso[];
    actuaciones: ActuacionElegible[];
  }> {
    return this.operar(sesion, async (db) => {
      const resultado = await db.query<{
        existe: boolean;
        borradores: BorradorCaso[];
        actuaciones: ActuacionElegible[];
      }>(
        `SELECT EXISTS (SELECT 1 FROM convi.casos WHERE id = $1) AS existe,
           (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.creado_en DESC, x.id), '[]'::jsonb)
            FROM (
              SELECT b.id, b.tipo_borrador AS tipo, b.titulo, b.contenido, b.estado,
                CASE WHEN ac.id IS NOT NULL THEN
                  initcap(lower(replace(ac.tipo_actuacion, '_', ' '))) ||
                  coalesce(' del ' || to_char(coalesce(ac.realizado_en, ac.programado_en), 'DD-MM-YYYY'), '')
                END AS actuacion,
                pc.nombres || ' ' || pc.apellidos AS creado_por, b.creado_en,
                CASE WHEN b.revisado_por IS NOT NULL THEN pr.nombres || ' ' || pr.apellidos END AS revisado_por,
                b.revisado_en, b.borrador_anterior_id,
                (WITH RECURSIVE cadena AS (
                   SELECT b.borrador_anterior_id AS anterior, 1 AS n
                   UNION ALL
                   SELECT p.borrador_anterior_id, c.n + 1
                   FROM cadena c JOIN convi.borradores_documentales_ia p ON p.id = c.anterior)
                 SELECT max(n) FROM cadena) AS edicion,
                EXISTS (SELECT 1 FROM convi.borradores_documentales_ia s
                        WHERE s.borrador_anterior_id = b.id) AS reemplazado,
                b.creado_por = convi.membresia_actual() AS propio,
                md5(to_jsonb(b)::text) AS version
              FROM convi.borradores_documentales_ia b
              JOIN convi.membresias_establecimiento mc ON mc.id = b.creado_por
              JOIN convi.personas pc ON pc.id = mc.persona_id
              LEFT JOIN convi.membresias_establecimiento mr ON mr.id = b.revisado_por
              LEFT JOIN convi.personas pr ON pr.id = mr.persona_id
              LEFT JOIN convi.actuaciones ac ON ac.id = b.actuacion_id
              WHERE b.caso_id = $1) x) AS borradores,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', a.id, 'tipo', a.tipo_actuacion, 'estado', a.estado,
                'fecha', coalesce(a.realizado_en, a.programado_en), 'objetivo', a.objetivo)
                ORDER BY coalesce(a.realizado_en, a.programado_en) DESC NULLS LAST, a.id), '[]'::jsonb)
            FROM convi.actuaciones a
            WHERE a.caso_id = $1 AND a.estado <> 'CANCELADA') AS actuaciones`,
        [casoId],
      );
      const fila = resultado.rows[0];
      if (!fila.existe) throw new NotFoundException('El caso no existe.');
      return { borradores: fila.borradores, actuaciones: fila.actuaciones };
    });
  }

  // HU-106 CA1 y HU-107 CA1: la IA redacta el borrador con el expediente
  // oculto con seudónimos, y CONVI lo guarda con la solicitud, el autor y la
  // fecha. La solicitud queda registrada sin el expediente ni el texto (HU-128).
  async generar(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const pedido = validarSolicitudBorrador(cuerpo);
    const inicio = Date.now();
    const proposito = `BORRADOR_${pedido.tipo}`;
    const { mensajes, contexto, seudonimos, solicitudId } = await this.operar(
      sesion,
      async (db) => {
        const leido = await leerCaso(db, casoId);
        const actuacion = pedido.actuacion_id
          ? await leerActuacion(db, casoId, pedido.actuacion_id)
          : null;
        const cifras =
          pedido.tipo === 'INFORME' ? await cifrasDelCaso(db, casoId) : null;
        // Los asistentes que no están en el caso también se ocultan.
        const personas = sinRepetir([
          ...leido.personas,
          ...(actuacion?.personas ?? []),
        ]);
        const { seudonimos: lista, ocultar } = crearOcultador(personas);
        const alias = new Map(
          personas.map((p, i) => [p.persona_id, lista[i].alias]),
        );
        const datos = contextoBorrador(
          pedido.tipo,
          {
            caso: leido.contexto,
            actuacion: actuacion?.datos ?? null,
            cifras,
            alias,
          },
          ocultar,
        );
        const registro = await db.query<{ id: string }>(
          `INSERT INTO convi.registros_solicitudes_ia
             (establecimiento_id, membresia_id, caso_id, codigo_proposito, nombre_modelo)
           VALUES (convi.establecimiento_actual(), convi.membresia_actual(), $1, $2, $3)
           RETURNING id`,
          [casoId, proposito, MODELO_GENERACION],
        );
        return {
          mensajes: mensajesBorrador(pedido.tipo, datos),
          contexto: datos,
          seudonimos: lista,
          solicitudId: registro.rows[0].id,
        };
      },
    );
    const que =
      pedido.tipo === 'ACTA' ? 'Borrador de acta' : 'Borrador de informe';

    let borrador: { titulo: string; contenido: string };
    try {
      configuracionGeneracion();
      borrador = interpretarBorrador(
        await generar(mensajes, ESQUEMA_BORRADOR),
        contexto,
        seudonimos,
      );
    } catch (error) {
      if (error instanceof BorradorRechazado) {
        await this.cerrar(
          sesion,
          solicitudId,
          'COMPLETADO',
          inicio,
          `${que} no guardado: ${error.message.split(',')[0]}`,
        ).catch(() => {});
        throw new ConflictException(error.message);
      }
      if (!(error instanceof ErrorIA)) throw error;
      this.logger.warn(`Falló el borrador ${solicitudId}`);
      await this.cerrar(
        sesion,
        solicitudId,
        'FALLIDO',
        inicio,
        `${que} fallido: ${error.message}`,
      ).catch(() => {});
      throw new ServiceUnavailableException(NO_DISPONIBLE);
    }

    // La base exige la solicitud completada antes de guardar el borrador.
    return this.operar(sesion, async (db) => {
      await db.query(
        `UPDATE convi.registros_solicitudes_ia
         SET estado = 'COMPLETADO', completado_en = now(), latencia_ms = $2,
             resumen_sin_datos_sensibles = $3
         WHERE id = $1 AND estado = 'INICIADA'`,
        [
          solicitudId,
          Date.now() - inicio,
          `${que} guardado pendiente de revisión, ${borrador.contenido.length} caracteres`,
        ],
      );
      const guardado = await db.query<{ id: string }>(
        `INSERT INTO convi.borradores_documentales_ia
           (establecimiento_id, tipo_borrador, caso_id, actuacion_id, solicitud_ia_id,
            titulo, contenido, creado_por)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5, $6, convi.membresia_actual())
         RETURNING id`,
        [
          pedido.tipo,
          casoId,
          pedido.actuacion_id,
          solicitudId,
          borrador.titulo,
          borrador.contenido,
        ],
      );
      return guardado.rows[0];
    });
  }

  // HU-106 CA2 y HU-107 CA2: editar no cambia el texto que generó la IA, crea
  // otra edición enlazada a la anterior con la misma solicitud.
  editar(
    sesion: Sesion,
    borradorId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; caso_id: string }> {
    const datos = validarEdicionBorrador(cuerpo);
    return this.operar(sesion, async (db) => {
      const actual = await bloquear(db, borradorId, datos.version);
      if (!actual.propio) throw new ForbiddenException(SOLO_AUTOR);
      const nuevo = await db.query<{ id: string }>(
        `INSERT INTO convi.borradores_documentales_ia
           (establecimiento_id, tipo_borrador, caso_id, actuacion_id, solicitud_ia_id,
            titulo, contenido, creado_por, borrador_anterior_id)
         SELECT establecimiento_id, tipo_borrador, caso_id, actuacion_id, solicitud_ia_id,
                $2, $3, convi.membresia_actual(), id
         FROM convi.borradores_documentales_ia WHERE id = $1
         RETURNING id`,
        [borradorId, datos.titulo, datos.contenido],
      );
      return { id: nuevo.rows[0].id, caso_id: actual.caso_id };
    });
  }

  // Revisar o descartar conserva quién y cuándo (la base pone la fecha y la
  // auditoría guarda el cambio). Pasa una sola vez y solo en la última edición.
  revisar(
    sesion: Sesion,
    borradorId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; caso_id: string }> {
    const datos = validarRevisionBorrador(cuerpo);
    return this.operar(sesion, async (db) => {
      const actual = await bloquear(db, borradorId, datos.version);
      await db.query(
        `UPDATE convi.borradores_documentales_ia
         SET estado = $2, revisado_por = convi.membresia_actual()
         WHERE id = $1`,
        [borradorId, datos.estado_nuevo],
      );
      return { id: borradorId, caso_id: actual.caso_id };
    });
  }

  private cerrar(
    sesion: Sesion,
    id: string,
    estado: 'COMPLETADO' | 'FALLIDO',
    inicio: number,
    resumen: string,
  ) {
    return this.operar(sesion, (db) =>
      db.query(
        `UPDATE convi.registros_solicitudes_ia
         SET estado = $2, completado_en = now(), latencia_ms = $3,
             resumen_sin_datos_sensibles = $4
         WHERE id = $1 AND estado = 'INICIADA'`,
        [id, estado, Date.now() - inicio, resumen.slice(0, 500)],
      ),
    );
  }
}

/** La última edición, pendiente y sin cambios desde que se vio (PB-139). */
async function bloquear(db: PoolClient, id: string, version: string) {
  // Una edición agrega una fila: actualizar el padre invalida instantáneas que no la ven.
  await db.query(
    "UPDATE convi.borradores_documentales_ia SET estado = estado WHERE id = $1 AND estado = 'BORRADOR'",
    [id],
  );
  const fila = (
    await db.query<{
      caso_id: string;
      estado: string;
      version: string;
      propio: boolean;
      reemplazado: boolean;
    }>(
      `SELECT b.caso_id, b.estado, md5(to_jsonb(b)::text) AS version,
         b.creado_por = convi.membresia_actual() AS propio,
         EXISTS (SELECT 1 FROM convi.borradores_documentales_ia s
                 WHERE s.borrador_anterior_id = b.id) AS reemplazado
       FROM convi.borradores_documentales_ia b WHERE b.id = $1 FOR UPDATE`,
      [id],
    )
  ).rows[0];
  if (!fila) throw new NotFoundException(NO_EXISTE);
  if (fila.estado !== 'BORRADOR') throw new ConflictException(YA_REVISADO);
  if (fila.reemplazado) throw new ConflictException(HAY_EDICION);
  if (fila.version !== version) throw new ConflictException(DESACTUALIZADO);
  return fila;
}

function sinRepetir(personas: PersonaCaso[]) {
  const vistas = new Set<string>();
  return personas.filter(
    (p) => !vistas.has(p.persona_id) && vistas.add(p.persona_id),
  );
}

/** La actuación del acta, con sus asistentes y las fechas en la zona de la escuela. */
async function leerActuacion(
  db: PoolClient,
  casoId: string,
  actuacionId: string,
): Promise<{ datos: ActuacionBorrador; personas: PersonaCaso[] }> {
  const fila = (
    await db.query<Omit<ActuacionBorrador, 'asistentes'>>(
      `SELECT tipo_actuacion AS tipo, estado,
         to_char(coalesce(realizado_en, programado_en), 'YYYY-MM-DD HH24:MI') AS inicio,
         to_char(coalesce(fin_real_en, fin_programado_en), 'YYYY-MM-DD HH24:MI') AS termino,
         lugar, objetivo, descripcion, resultado, proxima_accion
       FROM convi.actuaciones WHERE id = $1 AND caso_id = $2`,
      [actuacionId, casoId],
    )
  ).rows[0];
  if (!fila)
    throw new NotFoundException('La actuación no existe o no es de este caso.');
  const asistentes = (
    await db.query<
      PersonaCaso & { rol_asistente: string; asistencia: string | null }
    >(
      `SELECT p.id AS persona_id, p.nombres, p.apellidos,
         (e.id IS NOT NULL) AS es_estudiante, pa.rol_contextual AS rol,
         NULL::text AS curso, true AS en_caso,
         pa.rol_contextual AS rol_asistente, pa.estado_asistencia AS asistencia
       FROM convi.participaciones pa
       JOIN convi.personas p ON p.id = pa.persona_id
       LEFT JOIN convi.estudiantes e ON e.persona_id = p.id
       WHERE pa.actuacion_id = $1 AND pa.activo_hasta IS NULL
       ORDER BY p.apellidos, p.nombres`,
      [actuacionId],
    )
  ).rows;
  return {
    datos: {
      ...fila,
      asistentes: asistentes.map((a) => ({
        persona_id: a.persona_id,
        rol: a.rol_asistente,
        asistencia: a.asistencia,
      })),
    },
    personas: asistentes,
  };
}

/** HU-107 CA1: las cifras del informe las calcula el servidor, no la IA. */
async function cifrasDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<CifrasCaso> {
  const fila = (
    await db.query<CifrasCaso>(
      `SELECT (current_date - c.fecha_inicio) AS dias_desde_inicio,
         (SELECT count(*)::int FROM convi.situaciones WHERE caso_id = c.id) AS situaciones,
         (SELECT coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) FROM
            (SELECT estado, count(*)::int n FROM convi.actuaciones
             WHERE caso_id = c.id GROUP BY estado) x) AS actuaciones,
         (SELECT coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) FROM
            (SELECT estado, count(*)::int n FROM convi.compromisos
             WHERE caso_id = c.id GROUP BY estado) x) AS compromisos,
         (SELECT coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) FROM
            (SELECT ep.estado, count(*)::int n
             FROM convi.estados_pasos_protocolo_caso ep
             JOIN convi.protocolos_caso pa ON pa.id = ep.protocolo_caso_id
             WHERE pa.caso_id = c.id GROUP BY ep.estado) x) AS pasos_protocolo
       FROM convi.casos c WHERE c.id = $1`,
      [casoId],
    )
  ).rows[0];
  if (!fila) throw new NotFoundException('El caso no existe.');
  return fila;
}
