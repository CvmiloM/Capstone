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

// PB-018 (HU-014): matrícula de un estudiante en un curso. La base asegura que
// el curso sea del año de la matrícula y que no haya dos matrículas con
// períodos superpuestos; la API lo revisa antes para dar un mensaje claro.
const PERFILES: Perfil[] = ['ADMIN'];

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
      const estudiante = await db.query<{ estado: string }>(
        `UPDATE convi.estudiantes SET estado = estado
         WHERE id = $1 RETURNING estado`,
        [estudianteId],
      );
      if (estudiante.rows.length === 0)
        throw new NotFoundException('No encontramos ese estudiante.');
      const estadoEstudiante = estudiante.rows[0].estado;
      if (estadoEstudiante !== 'ACTIVO')
        throw new ConflictException(
          `El estudiante está ${NOMBRE_ESTADO[estadoEstudiante] ?? estadoEstudiante.toLowerCase()}: no se puede matricular.`,
        );

      // FOR SHARE impide que el año se cierre mientras se matricula.
      const curso = await db.query<{
        nombre: string;
        estado: string;
        anio_academico_id: string;
        anio: number;
        anio_estado: string;
        fecha_inicio: string | null;
        fecha_fin: string | null;
      }>(
        `SELECT c.nombre, c.estado, c.anio_academico_id, an.anio,
                an.estado AS anio_estado,
                an.fecha_inicio::text AS fecha_inicio,
                an.fecha_fin::text AS fecha_fin
         FROM convi.cursos c
         JOIN convi.anios_academicos an ON an.id = c.anio_academico_id
         WHERE c.id = $1
         FOR SHARE OF c, an`,
        [datos.curso_id],
      );
      if (curso.rows.length === 0)
        throw errorDeCampos(
          { curso_id: 'Elige un curso de tu escuela.' },
          'Revisa los datos marcados. No se guardó la matrícula.',
        );
      const elegido = curso.rows[0];
      if (!ANIOS_EDITABLES.includes(elegido.anio_estado))
        throw errorDeCampos(
          {
            curso_id: `El año ${elegido.anio} está cerrado: ya no se matricula en sus cursos.`,
          },
          'Revisa los datos marcados. No se guardó la matrícula.',
        );
      if (['CERRADO', 'ARCHIVADO'].includes(elegido.estado))
        throw errorDeCampos(
          { curso_id: 'Ese curso está cerrado. Elige otro.' },
          'Revisa los datos marcados. No se guardó la matrícula.',
        );

      // La matrícula empieza dentro de las fechas del año, si están definidas.
      const fecha = datos.matriculado_en;
      if (
        (elegido.fecha_inicio && fecha < elegido.fecha_inicio) ||
        (elegido.fecha_fin && fecha > elegido.fecha_fin)
      )
        throw errorDeCampos(
          {
            matriculado_en: `Elige una fecha dentro del año ${elegido.anio}${
              elegido.fecha_inicio && elegido.fecha_fin
                ? ` (del ${fechaLegible(elegido.fecha_inicio)} al ${fechaLegible(elegido.fecha_fin)})`
                : ''
            }.`,
          },
          'Revisa los datos marcados. No se guardó la matrícula.',
        );

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