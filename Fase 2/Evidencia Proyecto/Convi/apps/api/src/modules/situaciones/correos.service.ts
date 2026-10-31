import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { ErrorIA, MODELO_GENERACION } from '../normativa/consulta.js';
import { configuracionGeneracion, generar } from '../normativa/generacion.js';
import {
  pideCruzarLimite,
  TEXTO_LIMITE,
  type PersonaCaso,
} from '../orientacion/orientacion.js';
import {
  CorreoRechazado,
  ESQUEMA_CORREO,
  interpretarCorreo,
  prepararCorreo,
} from './correo-ia.js';
import {
  destinatariosDeCorreo,
  validarBorradorCorreo,
  validarSolicitudCorreoIA,
  type BorradorCorreo,
} from './correos.js';

// PB-151 (HU-130) y PB-086 (HU-075): borradores de correo al apoderado. Solo
// Convivencia activa con segundo factor; la seguridad por fila separa por
// escuela. Nada de esto envía el correo: eso es PB-087 (HU-076).
const PERFILES: Perfil[] = ['CONVIVENCIA'];
const NO_GUARDADO = 'Revisa los datos marcados. No se guardó el borrador.';
const NO_EXISTE = 'El correo no existe.';
const NO_EDITABLE =
  'Este correo ya fue confirmado: para cambiarlo crea un nuevo borrador.';
const NO_DISPONIBLE =
  'La IA no está disponible en este momento, puedes redactar el correo a mano e intentarlo con IA más tarde.';

@Injectable()
export class CorreosService {
  private readonly logger = new Logger(CorreosService.name);
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      trabajo,
    );
  }

  // HU-130 CA1 a CA3: borrador redactado a mano, sin marca de IA.
  crear(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarBorradorCorreo(cuerpo);
    return this.operar(sesion, async (db) => {
      await casoAbierto(db, casoId);
      const direccion = await direccionFinal(db, casoId, datos);
      const correo = await db.query<{ id: string }>(
        `INSERT INTO convi.comunicaciones
           (establecimiento_id, caso_id, tipo_comunicacion, persona_destinataria_id,
            direccion_destinatario, asunto, cuerpo_enviado, resumen, estado_entrega,
            creado_por, generado_por_ia)
         VALUES (convi.establecimiento_actual(), $1, 'CORREO', $2, $3, $4::text, $5, $4::text,
                 'BORRADOR', convi.membresia_actual(), false)
         RETURNING id`,
        [
          casoId,
          datos.persona_destinataria_id,
          direccion,
          datos.asunto,
          datos.contenido,
        ],
      );
      return correo.rows[0];
    });
  }

  // HU-130 CA2 y HU-075 CA2: se edita mientras sea borrador sin confirmar. Un
  // borrador de la IA conserva su marca aunque el profesional lo corrija.
  editar(
    sesion: Sesion,
    correoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarBorradorCorreo(cuerpo);
    return this.operar(sesion, async (db) => {
      const casoId = await bloquearBorrador(db, correoId);
      await casoAbierto(db, casoId);
      const direccion = await direccionFinal(db, casoId, datos);
      await db.query(
        `UPDATE convi.comunicaciones
         SET persona_destinataria_id = $2, direccion_destinatario = $3,
             asunto = $4::text, cuerpo_enviado = $5, resumen = $4::text
         WHERE id = $1`,
        [
          correoId,
          datos.persona_destinataria_id,
          direccion,
          datos.asunto,
          datos.contenido,
        ],
      );
      return { id: correoId };
    });
  }

  // Decisión del PO (2026-10-31): un borrador nunca confirmado se puede
  // descartar. La base solo deja borrar esos y registra el descarte en la
  // auditoría (migración descartar_borrador_correo).
  descartar(sesion: Sesion, correoId: string): Promise<{ id: string }> {
    return this.operar(sesion, async (db) => {
      await bloquearBorrador(db, correoId);
      await db.query('DELETE FROM convi.comunicaciones WHERE id = $1', [
        correoId,
      ]);
      return { id: correoId };
    });
  }

  // HU-075: la IA redacta un borrador para un apoderado del caso a partir de la
  // indicación del profesional. CA4: la solicitud queda registrada sin la
  // indicación ni el texto del correo.
  async generarConIA(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const solicitud = validarSolicitudCorreoIA(cuerpo);
    const inicio = Date.now();
    const { personas, firma, solicitudId } = await this.operar(
      sesion,
      async (db) => {
        await casoAbierto(db, casoId);
        const leido = await personasDelCorreo(
          db,
          casoId,
          solicitud.persona_destinataria_id,
        );
        const registro = await db.query<{ id: string }>(
          `INSERT INTO convi.registros_solicitudes_ia
           (establecimiento_id, membresia_id, caso_id, codigo_proposito, nombre_modelo)
         VALUES (convi.establecimiento_actual(), convi.membresia_actual(), $1, 'BORRADOR_CORREO', $2)
         RETURNING id`,
          [casoId, MODELO_GENERACION],
        );
        return { ...leido, solicitudId: registro.rows[0].id };
      },
    );

    // HU-104 CA2: pedir clasificar, predecir o diagnosticar no llega al modelo.
    if (pideCruzarLimite(solicitud.indicacion)) {
      await this.cerrar(
        sesion,
        solicitudId,
        'COMPLETADO',
        inicio,
        'Borrador de correo no preparado porque la indicación pedía clasificar, predecir o diagnosticar',
      );
      throw new ConflictException(TEXTO_LIMITE);
    }

    let borrador: { asunto: string; contenido: string };
    try {
      configuracionGeneracion();
      const { mensajes, permitidos } = prepararCorreo(
        personas,
        solicitud.indicacion,
      );
      borrador = interpretarCorreo(
        await generar(mensajes, ESQUEMA_CORREO),
        permitidos,
        firma,
      );
    } catch (error) {
      if (error instanceof CorreoRechazado) {
        await this.cerrar(
          sesion,
          solicitudId,
          'COMPLETADO',
          inicio,
          `Borrador de correo no guardado: ${error.message.split(',')[0]}`,
        ).catch(() => {});
        throw new ConflictException(error.message);
      }
      if (!(error instanceof ErrorIA)) throw error;
      // HU-128: el registro dice qué falló, sin la indicación ni el correo.
      this.logger.warn(`Falló el borrador de correo ${solicitudId}`);
      await this.cerrar(
        sesion,
        solicitudId,
        'FALLIDO',
        inicio,
        `Borrador de correo fallido: ${error.message}`,
      ).catch(() => {});
      throw new ServiceUnavailableException(NO_DISPONIBLE);
    }

    // CA1: queda como comunicación de tipo Correo en Borrador, marcada como IA.
    const guardado = await this.operar(sesion, async (db) => {
      await casoAbierto(db, casoId);
      const direccion = await direccionFinal(
        db,
        casoId,
        {
          persona_destinataria_id: solicitud.persona_destinataria_id,
          direccion: null,
        },
        true,
      );
      return (
        await db.query<{ id: string }>(
          `INSERT INTO convi.comunicaciones
             (establecimiento_id, caso_id, tipo_comunicacion, persona_destinataria_id,
              direccion_destinatario, asunto, cuerpo_enviado, resumen, estado_entrega,
              creado_por, generado_por_ia)
           VALUES (convi.establecimiento_actual(), $1, 'CORREO', $2, $3, $4::text, $5, $4::text,
                   'BORRADOR', convi.membresia_actual(), true)
           RETURNING id`,
          [
            casoId,
            solicitud.persona_destinataria_id,
            direccion,
            borrador.asunto,
            borrador.contenido,
          ],
        )
      ).rows[0];
    });
    await this.cerrar(
      sesion,
      solicitudId,
      'COMPLETADO',
      inicio,
      `Borrador de correo guardado, ${borrador.contenido.length} caracteres`,
    );
    return guardado;
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

/** FOR SHARE: el caso no se cierra mientras se guarda el borrador. */
async function casoAbierto(db: PoolClient, casoId: string) {
  const caso = await db
    .query<{ estado_actual: string }>(
      'SELECT estado_actual FROM convi.casos WHERE id = $1 FOR SHARE',
      [casoId],
    )
    .catch((error: unknown) => {
      if ((error as { code?: string }).code === '40001')
        throw new ConflictException(
          'El caso cambió mientras escribías. Recarga la página e inténtalo nuevamente.',
        );
      throw error;
    });
  if (!caso.rows[0]) throw new NotFoundException('El caso no existe.');
  // Decisión del PO (por defecto), como en las comunicaciones: un caso cerrado
  // conserva sus correos, pero no recibe ni edita borradores.
  if (caso.rows[0].estado_actual === 'CERRADO')
    throw new ConflictException(
      'El caso está cerrado: conserva sus correos, pero no recibe ni edita borradores.',
    );
}

/** Bloquea el borrador y devuelve su caso. 409 si ya fue confirmado o enviado. */
async function bloquearBorrador(db: PoolClient, correoId: string) {
  const fila = (
    await db.query<{ caso_id: string; editable: boolean }>(
      `SELECT caso_id,
              (estado_entrega = 'BORRADOR' AND confirmado_en IS NULL
               AND enviado_en IS NULL AND clave_envio IS NULL) AS editable
       FROM convi.comunicaciones
       WHERE id = $1 AND tipo_comunicacion = 'CORREO'
       FOR UPDATE`,
      [correoId],
    )
  ).rows[0];
  if (!fila) throw new NotFoundException(NO_EXISTE);
  if (!fila.editable) throw new ConflictException(NO_EDITABLE);
  return fila.caso_id;
}

/**
 * La persona elegida debe poder recibir comunicaciones del caso. La dirección
 * escrita manda; si falta, se usa el correo de su ficha. Un borrador de la IA
 * puede quedar sin dirección para completarla al editarlo.
 */
async function direccionFinal(
  db: PoolClient,
  casoId: string,
  datos: Pick<BorradorCorreo, 'persona_destinataria_id' | 'direccion'>,
  sinDireccionPermitida = false,
): Promise<string | null> {
  if (!datos.persona_destinataria_id) return datos.direccion;
  const persona = (await destinatariosDeCorreo(db, casoId)).find(
    (p) => p.persona_id === datos.persona_destinataria_id,
  );
  if (!persona)
    throw new BadRequestException({
      mensaje: NO_GUARDADO,
      errores: {
        persona_destinataria_id:
          'Elige a una persona del caso, a uno de sus apoderados o a alguien del equipo.',
      },
    });
  const direccion = datos.direccion ?? persona.correo;
  if (!direccion && !sinDireccionPermitida)
    throw new BadRequestException({
      mensaje: NO_GUARDADO,
      errores: {
        direccion:
          'Esta persona no tiene correo en su ficha, escribe su dirección.',
      },
    });
  return direccion;
}

/**
 * Apoderado destinatario, sus estudiantes del caso y el resto de las personas
 * del caso (sus nombres se ocultan aunque el profesional los escriba), más la
 * firma que CONVI agrega al final del correo.
 */
async function personasDelCorreo(
  db: PoolClient,
  casoId: string,
  apoderadoId: string,
) {
  const destinatarios = await destinatariosDeCorreo(db, casoId);
  if (
    !destinatarios.some(
      (d) => d.persona_id === apoderadoId && d.rol === 'APODERADO',
    )
  )
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se preparó el borrador.',
      errores: {
        persona_destinataria_id:
          'Elige a un apoderado con vínculo vigente con un estudiante del caso.',
      },
    });
  const filas = (
    await db.query<
      PersonaCaso & { del_apoderado: boolean; es_destinatario: boolean }
    >(
      `WITH del_caso AS (
         SELECT DISTINCT pa.persona_id
         FROM convi.participaciones pa
         WHERE pa.activo_hasta IS NULL
           AND (pa.caso_id = $1
                OR pa.situacion_id IN (SELECT id FROM convi.situaciones WHERE caso_id = $1))
       )
       SELECT p.id AS persona_id, p.nombres, p.apellidos,
              (e.id IS NOT NULL) AS es_estudiante, NULL AS rol, NULL AS curso,
              true AS en_caso,
              EXISTS (SELECT 1 FROM convi.apoderados_estudiante ae
                      WHERE ae.estudiante_id = e.id AND ae.persona_apoderado_id = $2
                        AND (ae.activo_hasta IS NULL OR ae.activo_hasta >= current_date))
                AS del_apoderado,
              (p.id = $2) AS es_destinatario
       FROM convi.personas p
       LEFT JOIN convi.estudiantes e ON e.persona_id = p.id
       WHERE p.id IN (SELECT persona_id FROM del_caso) OR p.id = $2
       ORDER BY p.apellidos, p.nombres, p.id`,
      [casoId, apoderadoId],
    )
  ).rows;
  const destinatario = filas.find((f) => f.es_destinatario)!;
  const estudiantes = filas.filter((f) => f.es_estudiante && f.del_apoderado);
  const otras = filas.filter(
    (f) => !f.es_destinatario && !(f.es_estudiante && f.del_apoderado),
  );
  const yo = (
    await db.query<{ nombre: string; escuela: string }>(
      `SELECT p.nombres || ' ' || p.apellidos AS nombre, e.nombre AS escuela
       FROM convi.membresias_establecimiento m
       JOIN convi.personas p ON p.id = m.persona_id
       JOIN convi.establecimientos e ON e.id = m.establecimiento_id
       WHERE m.id = convi.membresia_actual()`,
    )
  ).rows[0];
  const firma = yo
    ? `${yo.nombre}\nEquipo de Convivencia Escolar\n${yo.escuela}`
    : 'Equipo de Convivencia Escolar';
  return { personas: { destinatario, estudiantes, otras }, firma };
}
