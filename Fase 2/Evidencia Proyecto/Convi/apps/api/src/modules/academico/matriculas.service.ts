import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { ANIOS_EDITABLES, errorDeCampos } from './curso.js';
import { fechaLegible, validarMatricula } from './estudiante.js';
import {
  ESTADO_ESTUDIANTE,
  ESTADO_TERMINO,
  MENSAJE_MOVIMIENTO,
  terminoMatricula,
  validarMovimiento,
} from './movimiento-matricula.js';

// PB-018 (HU-014): matrícula de un estudiante en un curso. La base asegura que
// el curso sea del año de la matrícula y que no haya dos matrículas con
// períodos superpuestos; la API lo revisa antes para dar un mensaje claro.
const PERFILES: Perfil[] = ['ADMIN'];
const MENSAJE_MATRICULA =
  'Revisa los datos marcados. No se guardó la matrícula.';

export type Matricula = {
  id: string;
  curso_id: string;
  curso_codigo: string;
  curso_nombre: string;
  anio_academico_id: string;
  anio: number;
  anio_estado: string;
  /** ACTIVO, TRASLADADO, COMPLETADO o RETIRADO. */
  estado: string;
  /** AAAA-MM-DD. */
  matriculado_en: string;
  /** AAAA-MM-DD; null mientras la matrícula esté activa. */
  finalizado_en: string | null;
};

export const COLUMNAS_MATRICULA = `
  m.id, m.curso_id, c.codigo AS curso_codigo, c.nombre AS curso_nombre,
  m.anio_academico_id, an.anio, an.estado AS anio_estado, m.estado,
  m.matriculado_en::text AS matriculado_en,
  m.finalizado_en::text AS finalizado_en`;

export const DESDE_MATRICULAS = `
  FROM convi.matriculas m
  JOIN convi.cursos c ON c.id = m.curso_id
  JOIN convi.anios_academicos an ON an.id = m.anio_academico_id`;

type ErrorPostgres = { code?: string; constraint?: string; message?: string };

type CursoDisponible = {
  nombre: string;
  estado: string;
  anio_academico_id: string;
  anio: number;
  anio_estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
};

const NOMBRE_ESTADO: Record<string, string> = {
  INACTIVO: 'inactivo',
  EGRESADO: 'egresado',
};

@Injectable()
export class MatriculasService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // CA3: el año es el del curso, el curso es de un año Planificado o Activo
  // (decisión del PO de PB-015) y el estudiante no queda con dos matrículas
  // al mismo tiempo.
  matricular(
    sesion: Sesion,
    estudianteId: string,
    cuerpo: unknown,
  ): Promise<Matricula> {
    const datos = validarMatricula(cuerpo);
    return this.operar(sesion, async (db) => {
      // Se "toca" la fila del estudiante: si otra persona lo matricula al
      // mismo tiempo, la base rechaza la segunda operación (40001) en vez de
      // dejar dos matrículas. Un FOR UPDATE solo no basta, porque la lectura
      // de esta transacción empezó antes de esperar el bloqueo.
      const estadoEstudiante = await tocarEstudiante(db, estudianteId);
      if (estadoEstudiante !== 'ACTIVO')
        throw new ConflictException(
          `El estudiante está ${NOMBRE_ESTADO[estadoEstudiante] ?? estadoEstudiante.toLowerCase()}: no se puede matricular.`,
        );

      const fecha = datos.matriculado_en;
      const elegido = await cursoDisponible(db, datos.curso_id, fecha, {
        campoFecha: 'matriculado_en',
        mensaje: MENSAJE_MATRICULA,
      });

      // CA3: la nueva matrícula queda abierta, así que choca con cualquier
      // otra que siga vigente o que termine en esa fecha o después.
      const cruce = await db.query<{
        curso_nombre: string;
        anio: number;
        matriculado_en: string;
        finalizado_en: string | null;
      }>(
        `SELECT c.nombre AS curso_nombre, an.anio,
                m.matriculado_en::text AS matriculado_en,
                m.finalizado_en::text AS finalizado_en
         ${DESDE_MATRICULAS}
         WHERE m.estudiante_id = $1
           AND daterange(m.matriculado_en, m.finalizado_en, '[]')
               && daterange($2::date, NULL, '[]')
         ORDER BY m.matriculado_en DESC
         LIMIT 1`,
        [estudianteId, fecha],
      );
      if (cruce.rows.length > 0) {
        const otra = cruce.rows[0];
        throw new ConflictException(
          otra.finalizado_en
            ? `El estudiante tuvo matrícula en ${otra.curso_nombre} (${otra.anio}) hasta el ${fechaLegible(otra.finalizado_en)}. La nueva debe empezar después de esa fecha.`
            : `El estudiante ya está matriculado en ${otra.curso_nombre} (${otra.anio}) desde el ${fechaLegible(otra.matriculado_en)}. No puede tener dos matrículas al mismo tiempo.`,
        );
      }

      const creada = await db.query<{ id: string }>(
        `INSERT INTO convi.matriculas
           (establecimiento_id, estudiante_id, curso_id, anio_academico_id,
            matriculado_en)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, $4)
         RETURNING id`,
        [estudianteId, datos.curso_id, elegido.anio_academico_id, fecha],
      );
      const resultado = await db.query<Matricula>(
        `SELECT ${COLUMNAS_MATRICULA} ${DESDE_MATRICULAS} WHERE m.id = $1`,
        [creada.rows[0].id],
      );
      return resultado.rows[0];
    });
  }

  // PB-022 y PB-031 (HU-017 y HU-024): termina la matrícula vigente y, si el
  // estudiante cambia de curso o pasa de año, abre la nueva en la misma
  // operación (CA1). Al egresar o retirarse deja de estar Activo, sin borrar
  // matrículas, antecedentes ni casos.
  mover(
    sesion: Sesion,
    estudianteId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; matricula_id: string | null }> {
    const datos = validarMovimiento(cuerpo);
    return this.operar(sesion, async (db) => {
      // Igual que al matricular: dos cambios a la vez no dejan dos matrículas.
      const estadoEstudiante = await tocarEstudiante(db, estudianteId);
      if (estadoEstudiante !== 'ACTIVO')
        throw new ConflictException(
          `El estudiante está ${NOMBRE_ESTADO[estadoEstudiante] ?? estadoEstudiante.toLowerCase()}: su matrícula ya no cambia.`,
        );

      const vigente = (
        await db.query<{
          id: string;
          curso_id: string;
          anio_academico_id: string;
          matriculado_en: string;
          anio: number;
          fecha_fin: string | null;
        }>(
          `SELECT m.id, m.curso_id, m.anio_academico_id,
                  m.matriculado_en::text AS matriculado_en,
                  an.anio, an.fecha_fin::text AS fecha_fin
           FROM convi.matriculas m
           JOIN convi.anios_academicos an ON an.id = m.anio_academico_id
           WHERE m.estudiante_id = $1 AND m.estado = 'ACTIVO'
           FOR UPDATE OF m`,
          [estudianteId],
        )
      ).rows[0];
      if (!vigente)
        throw new ConflictException(
          'El estudiante no tiene una matrícula vigente que cambiar.',
        );
      // PB-139: no se cambia una matrícula distinta de la que vio el
      // administrador al abrir la ficha.
      if (vigente.id !== datos.matricula_id)
        throw new ConflictException(
          'Su matrícula cambió mientras completabas el formulario. Recarga la página para verla.',
        );

      let destino: CursoDisponible | null = null;
      if (datos.curso_id) {
        destino = await cursoDisponible(db, datos.curso_id, datos.fecha, {
          campoFecha: 'fecha',
          mensaje: MENSAJE_MOVIMIENTO,
        });
        if (datos.curso_id === vigente.curso_id)
          throw errorDeCampos(
            { curso_id: 'Ya está en ese curso. Elige otro.' },
            MENSAJE_MOVIMIENTO,
          );
        if (
          datos.tipo === 'TRASLADO' &&
          destino.anio_academico_id !== vigente.anio_academico_id
        )
          throw errorDeCampos(
            {
              curso_id: `Elige un curso del año ${vigente.anio}. Para pasar a otro año, elige Paso al año siguiente.`,
            },
            MENSAJE_MOVIMIENTO,
          );
        if (datos.tipo === 'PROMOCION' && destino.anio <= vigente.anio)
          throw errorDeCampos(
            {
              curso_id: `Elige un curso de un año posterior a ${vigente.anio}.`,
            },
            MENSAJE_MOVIMIENTO,
          );
      } else if (datos.fecha > (await hoyEscuela(db))) {
        throw errorDeCampos(
          { fecha: 'La fecha no puede ser futura.' },
          MENSAJE_MOVIMIENTO,
        );
      }

      const termino = terminoMatricula(
        datos.tipo,
        datos.fecha,
        vigente.fecha_fin,
      );
      if (termino < vigente.matriculado_en)
        throw errorDeCampos(
          {
            fecha: destino
              ? `El curso nuevo debe empezar después del ${fechaLegible(vigente.matriculado_en)}, cuando empezó su matrícula actual.`
              : `La fecha no puede ser anterior al ${fechaLegible(vigente.matriculado_en)}, cuando empezó su matrícula.`,
          },
          MENSAJE_MOVIMIENTO,
        );

      // El motivo queda en la auditoría de cada cambio de esta operación.
      if (datos.motivo)
        await db.query("SELECT set_config('app.motivo_cambio', $1, true)", [
          datos.motivo,
        ]);
      // CA5: la base guarda el antes y el después de la matrícula y del
      // estado del estudiante en eventos_auditoria.
      await db.query(
        `UPDATE convi.matriculas SET estado = $2, finalizado_en = $3
         WHERE id = $1`,
        [vigente.id, ESTADO_TERMINO[datos.tipo], termino],
      );
      const estadoNuevo = ESTADO_ESTUDIANTE[datos.tipo];
      if (estadoNuevo)
        await db.query(
          `UPDATE convi.estudiantes SET estado = $2 WHERE id = $1`,
          [estudianteId, estadoNuevo],
        );
      if (!destino) return { id: estudianteId, matricula_id: null };

      const nueva = await db.query<{ id: string }>(
        `INSERT INTO convi.matriculas
           (establecimiento_id, estudiante_id, curso_id, anio_academico_id,
            matriculado_en)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, $4)
         RETURNING id`,
        [estudianteId, datos.curso_id, destino.anio_academico_id, datos.fecha],
      );
      // La base audita los cambios, no las altas: la matrícula nueva queda
      // con su propio evento, que indica de qué matrícula viene.
      await db.query(
        `INSERT INTO convi.eventos_auditoria
           (establecimiento_id, membresia_actor_id, codigo_accion, tipo_recurso,
            recurso_id, codigo_resultado, metadatos)
         VALUES (convi.establecimiento_actual(), convi.membresia_actual(), $2,
                 'matriculas', $1, 'OK',
                 jsonb_build_object('matricula_anterior_id', $3::text,
                                    'curso_id', $4::text,
                                    'matriculado_en', $5::text,
                                    'motivo', $6::text))`,
        [
          nueva.rows[0].id,
          `MATRICULA_${datos.tipo}`,
          vigente.id,
          datos.curso_id,
          datos.fecha,
          datos.motivo,
        ],
      );
      return { id: estudianteId, matricula_id: nueva.rows[0].id };
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
          throw traducirError(error);
        }
      },
    );
  }
}

// Devuelve el estado del estudiante después de "tocar" su fila (ver matricular).
async function tocarEstudiante(db: PoolClient, estudianteId: string) {
  const estudiante = await db.query<{ estado: string }>(
    `UPDATE convi.estudiantes SET estado = estado
     WHERE id = $1 RETURNING estado`,
    [estudianteId],
  );
  if (estudiante.rows.length === 0)
    throw new NotFoundException('No encontramos ese estudiante.');
  return estudiante.rows[0].estado;
}

// Curso donde empieza una matrícula: de la escuela, de un año Planificado o
// Activo, abierto y con la fecha dentro del año, si sus fechas están
// definidas. FOR SHARE impide que el año se cierre mientras se matricula.
async function cursoDisponible(
  db: PoolClient,
  cursoId: string,
  fecha: string,
  { campoFecha, mensaje }: { campoFecha: string; mensaje: string },
) {
  const curso = await db.query<CursoDisponible>(
    `SELECT c.nombre, c.estado, c.anio_academico_id, an.anio,
            an.estado AS anio_estado,
            an.fecha_inicio::text AS fecha_inicio,
            an.fecha_fin::text AS fecha_fin
     FROM convi.cursos c
     JOIN convi.anios_academicos an ON an.id = c.anio_academico_id
     WHERE c.id = $1
     FOR SHARE OF c, an`,
    [cursoId],
  );
  if (curso.rows.length === 0)
    throw errorDeCampos({ curso_id: 'Elige un curso de tu escuela.' }, mensaje);
  const elegido = curso.rows[0];
  if (!ANIOS_EDITABLES.includes(elegido.anio_estado))
    throw errorDeCampos(
      {
        curso_id: `El año ${elegido.anio} está cerrado: ya no se matricula en sus cursos.`,
      },
      mensaje,
    );
  if (['CERRADO', 'ARCHIVADO'].includes(elegido.estado))
    throw errorDeCampos(
      { curso_id: 'Ese curso está cerrado. Elige otro.' },
      mensaje,
    );
  if (
    (elegido.fecha_inicio && fecha < elegido.fecha_inicio) ||
    (elegido.fecha_fin && fecha > elegido.fecha_fin)
  )
    throw errorDeCampos(
      {
        [campoFecha]: `Elige una fecha dentro del año ${elegido.anio}${
          elegido.fecha_inicio && elegido.fecha_fin
            ? ` (del ${fechaLegible(elegido.fecha_inicio)} al ${fechaLegible(elegido.fecha_fin)})`
            : ''
        }.`,
      },
      mensaje,
    );
  return elegido;
}

// El día de hoy en la zona horaria de la escuela (la base trabaja en UTC).
async function hoyEscuela(db: PoolClient) {
  const hoy = await db.query<{ hoy: string }>(
    `SELECT (now() AT TIME ZONE zona_horaria)::date::text AS hoy
     FROM convi.establecimientos
     WHERE id = convi.establecimiento_actual()`,
  );
  return hoy.rows[0].hoy;
}

// Convierte los errores conocidos del modelo en respuestas claras. Los demás
// siguen su curso: CuentaService.operar revierte y responde 503.
function traducirError(error: unknown) {
  const { code, constraint, message } = (error ?? {}) as ErrorPostgres;
  // CA3: llegan aquí si otra persona lo matriculó mientras se guardaba.
  if (
    (code === '23505' &&
      constraint ===
        'matriculas_establecimiento_id_estudiante_id_anio_academico__idx') ||
    (code === 'P0001' &&
      message?.startsWith('Matrículas con períodos superpuestos'))
  )
    return new ConflictException(
      'El estudiante ya tiene una matrícula en esas fechas. Recarga la página para verla.',
    );
  if (code === '40001')
    return new ConflictException(
      'El estudiante cambió mientras guardabas. Recarga la página e inténtalo de nuevo.',
    );
  return error;
}
