import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  avisaUrgencia,
  crearAvisos,
  EQUIPO,
  TEXTO_AVISO,
} from '../alertas/crear-avisos.js';

// Pasos comunes del registro de una situación, del profesor (PB-042) y de
// Convivencia por otros canales (PB-043). Cada servicio decide quién puede
// registrar y qué estudiantes acepta; aquí se guarda todo en la transacción
// que ya abrió CuentaService.operar (PB-138).

export type SituacionRegistrada = {
  id: string;
  codigo: string;
  estado: string;
  reportado_en: Date;
};

// El código SIT-AAAA-00001 lo asigna la base con el siguiente número libre de la
// escuela. Si dos registros llegan a la vez, el segundo puede chocar con el
// código del primero: se reintenta en una transacción nueva, que ya ve ese código.
// En cada vuelta al menos uno obtiene su código, así que cinco envíos
// simultáneos necesitan como máximo cinco intentos.
const INTENTOS_REGISTRO = 5;
const REGISTRO_SIMULTANEO =
  'Se registró otra situación al mismo tiempo. Envía el formulario nuevamente.';

function esChoqueDeCodigo(error: unknown) {
  const { code, constraint } = (error ?? {}) as {
    code?: string;
    constraint?: string;
  };
  return (
    code === '40001' ||
    (code === '23505' &&
      constraint === 'situaciones_establecimiento_id_codigo_key')
  );
}

/** Ejecuta el registro y lo repite si chocó con el código de otro registro simultáneo. */
export async function conReintentosDeCodigo<T>(
  registrar: () => Promise<T>,
): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await registrar();
    } catch (error) {
      const reintentar =
        error instanceof ConflictException &&
        error.message === REGISTRO_SIMULTANEO &&
        intento < INTENTOS_REGISTRO;
      if (!reintentar) throw error;
      // Una espera corta y distinta en cada petición evita que vuelvan a chocar.
      await new Promise((listo) => setTimeout(listo, 20 + Math.random() * 80));
    }
  }
}

/**
 * Convierte la fecha del hecho (hora de la escuela, HU-021) y revisa que no
 * sea futura y que la categoría esté activa. Anota los problemas en errores.
 */
export async function comprobarFechaYCategoria(
  db: PoolClient,
  datos: { ocurrido_en: string; categoria_id: string | null },
  errores: Record<string, string>,
): Promise<Date | null> {
  const fecha = await db.query<{ ocurrido_en: Date; futura: boolean }>(
    `SELECT ($1::timestamp AT TIME ZONE e.zona_horaria) AS ocurrido_en,
            ($1::timestamp AT TIME ZONE e.zona_horaria) > now() AS futura
     FROM convi.establecimientos e
     WHERE e.id = convi.establecimiento_actual()`,
    [datos.ocurrido_en],
  );
  const ocurrido = fecha.rows[0];
  if (!ocurrido || ocurrido.futura)
    errores.ocurrido_en = 'La fecha del hecho no puede ser futura.';

  if (datos.categoria_id) {
    const categoria = await db.query(
      `SELECT 1 FROM convi.categorias_convivencia
       WHERE id = $1 AND estado = 'ACTIVO'`,
      [datos.categoria_id],
    );
    if (categoria.rowCount === 0)
      errores.categoria_id = 'Elige una categoría de la lista.';
  }
  return ocurrido && !ocurrido.futura ? ocurrido.ocurrido_en : null;
}

/** Estudiante de la escuela con la matrícula que tenía el día del hecho. */
export type ParticipanteAlOcurrir = {
  estudiante_id: string;
  persona_id: string;
  /** null si ese día no tenía matrícula (HU-066 CA3). */
  matricula_id: string | null;
};

/**
 * PB-076 (HU-066 CA1): busca la matrícula de cada estudiante en la fecha del
 * hecho, según la hora de la escuela, aunque hoy esté en otro curso o ya no
 * esté matriculado. Las matrículas de un estudiante no se superponen (trigger
 * de convi.matriculas), así que hay a lo sumo una. Los estudiantes que no son
 * de la escuela no aparecen en el resultado.
 */
export async function matriculasAlOcurrir(
  db: PoolClient,
  estudianteIds: string[],
  ocurridoEn: Date,
): Promise<Map<string, ParticipanteAlOcurrir>> {
  const resultado = await db.query<ParticipanteAlOcurrir>(
    `SELECT e.id AS estudiante_id, e.persona_id, m.id AS matricula_id
     FROM convi.estudiantes e
     JOIN convi.establecimientos es ON es.id = e.establecimiento_id
     CROSS JOIN LATERAL (
       SELECT ($2::timestamptz AT TIME ZONE es.zona_horaria)::date AS dia
     ) h
     LEFT JOIN convi.matriculas m
       ON m.estudiante_id = e.id
      AND m.matriculado_en <= h.dia
      AND (m.finalizado_en IS NULL OR m.finalizado_en >= h.dia)
     WHERE e.id = ANY($1::uuid[])`,
    [estudianteIds, ocurridoEn],
  );
  return new Map(resultado.rows.map((fila) => [fila.estudiante_id, fila]));
}

/**
 * Inserta la situación y sus participantes. La base asigna el código, la
 * fecha de registro del servidor y el estado NUEVA (HU-035 CA3); el autor es
 * siempre la cuenta de la sesión (HU-036 CA2).
 */
export async function insertarSituacion(
  db: PoolClient,
  situacion: {
    curso_id: string | null;
    tipo_origen: string;
    persona_origen_id: string | null;
    ocurrido_en: Date;
    lugar: string | null;
    descripcion: string;
    categoria_id: string | null;
    urgencia: string;
    registro_historico?: boolean;
  },
  participantes: {
    persona_id: string;
    rol: string;
    matricula_id: string | null;
  }[],
): Promise<SituacionRegistrada> {
  const insertada = await db
    .query<SituacionRegistrada>(
      `INSERT INTO convi.situaciones
         (establecimiento_id, reportado_por_membresia_id, curso_contexto_id,
          tipo_origen, persona_origen_id, ocurrido_en, lugar, descripcion,
          categoria_id, urgencia, registro_historico)
       VALUES (convi.establecimiento_actual(), convi.membresia_actual(), $1,
               $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, codigo, estado, reportado_en`,
      [
        situacion.curso_id,
        situacion.tipo_origen,
        situacion.persona_origen_id,
        situacion.ocurrido_en,
        situacion.lugar,
        situacion.descripcion,
        situacion.categoria_id,
        situacion.urgencia,
        situacion.registro_historico ?? false,
      ],
    )
    .catch((error: unknown) => {
      if (esChoqueDeCodigo(error))
        throw new ConflictException(REGISTRO_SIMULTANEO);
      throw error;
    });
  const registrada = insertada.rows[0];

  // HU-066 CA1: cada estudiante queda con la matrícula que tenía el día del
  // hecho, o sin matrícula si ese día no tenía. El trigger de participaciones
  // exige que sea suya y no deja cambiarla después (CA3).
  await db.query(
    `INSERT INTO convi.participaciones
       (establecimiento_id, persona_id, situacion_id, rol_contextual,
        matricula_contexto_id)
     SELECT convi.establecimiento_actual(), x.persona_id, $1, x.rol,
            x.matricula_id
     FROM unnest($2::uuid[], $3::text[], $4::uuid[])
       AS x(persona_id, rol, matricula_id)`,
    [
      registrada.id,
      participantes.map((p) => p.persona_id),
      participantes.map((p) => p.rol),
      participantes.map((p) => p.matricula_id),
    ],
  );

  // PB-094 (HU-081 CA1): una situación Urgente o Inmediata avisa a todo el
  // equipo de Convivencia. Las del registro histórico ya ocurrieron hace
  // tiempo y no avisan (por defecto).
  if (!situacion.registro_historico && avisaUrgencia(situacion.urgencia))
    await crearAvisos(db, {
      tipo: 'SITUACION_URGENTE',
      ...TEXTO_AVISO.situacionUrgente(registrada.codigo, situacion.urgencia),
      tipoRecurso: 'situaciones',
      recursoId: registrada.id,
      destinatario: EQUIPO,
      evento: registrada.id,
    });
  return registrada;
}
