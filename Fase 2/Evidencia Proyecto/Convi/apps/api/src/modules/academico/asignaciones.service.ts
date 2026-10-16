import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  ANIOS_EDITABLES,
  errorDeCampos,
  type Rol,
  validarNuevaAsignacion,
  validarTermino,
} from './curso.js';

// PB-015 (HU-013): profesores asignados a los cursos de la escuela del
// administrador. CuentaService.operar fija la escuela de la sesión y la
// seguridad por fila oculta las demás (PB-141).
const PERFILES: Perfil[] = ['ADMIN'];

export type Asignacion = {
  id: string;
  rol: Rol;
  /** AAAA-MM-DD; null en asignaciones creadas sin fecha fuera de esta pantalla. */
  fecha_inicio: string | null;
  /** Último día de la asignación; null mientras no se termine. */
  fecha_fin: string | null;
  situacion: 'VIGENTE' | 'PROGRAMADA' | 'TERMINADA';
  membresia_id: string;
  nombres: string;
  apellidos: string;
  correo: string | null;
  estado_cuenta: string;
};

export type ProfesorDisponible = {
  membresia_id: string;
  nombres: string;
  apellidos: string;
  correo: string | null;
  estado: string;
};

type ErrorPostgres = { code?: string; constraint?: string; message?: string };

// Mismo criterio de vigencia que usa la base en convi.puede_reportar_curso.
export const COLUMNAS_ASIGNACION = `
  a.id, a.rol_asignacion AS rol,
  a.fecha_inicio::text AS fecha_inicio, a.fecha_fin::text AS fecha_fin,
  CASE WHEN a.fecha_fin < current_date THEN 'TERMINADA'
       WHEN a.fecha_inicio > current_date THEN 'PROGRAMADA'
       ELSE 'VIGENTE' END AS situacion,
  a.membresia_id, p.nombres, p.apellidos,
  me.correo_invitacion AS correo, me.estado AS estado_cuenta`;

export const DESDE_ASIGNACIONES = `
  FROM convi.asignaciones_docentes a
  JOIN convi.membresias_establecimiento me ON me.id = a.membresia_id
  JOIN convi.personas p ON p.id = me.persona_id`;

const REPETIDA = 'Ese profesor ya tiene ese rol en este curso en esas fechas.';

@Injectable()
export class AsignacionesService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Decisión del PO: se ofrecen profesores con la cuenta Activa o Pendiente
  // (invitados que todavía no la activan); suspendidos y revocados no.
  profesores(sesion: Sesion): Promise<ProfesorDisponible[]> {
    return this.operar(sesion, async (db) => {
      const resultado = await db.query<ProfesorDisponible>(
        `SELECT me.id AS membresia_id, p.nombres, p.apellidos,
                me.correo_invitacion AS correo, me.estado
         FROM convi.membresias_establecimiento me
         JOIN convi.personas p ON p.id = me.persona_id
         WHERE me.codigo_perfil = 'PROFESOR'
           AND me.estado IN ('ACTIVO', 'PENDIENTE')
         ORDER BY p.apellidos, p.nombres`,
      );
      return resultado.rows;
    });
  }

  asignar(
    sesion: Sesion,
    cursoId: string,
    cuerpo: unknown,
  ): Promise<Asignacion> {
    const datos = validarNuevaAsignacion(cuerpo);
    return this.operar(sesion, async (db) => {
      // El curso y el año quedan bloqueados hasta terminar la asignación.
      const curso = await db.query<{ anio: number; anio_estado: string }>(
        `SELECT an.anio, an.estado AS anio_estado
         FROM convi.cursos c
         JOIN convi.anios_academicos an ON an.id = c.anio_academico_id
         WHERE c.id = $1
         FOR UPDATE OF c FOR SHARE OF an`,
        [cursoId],
      );
      if (curso.rows.length === 0)
        throw new NotFoundException('No encontramos ese curso.');
      const { anio, anio_estado } = curso.rows[0];
      if (!ANIOS_EDITABLES.includes(anio_estado))
        throw new ConflictException(
          `El año ${anio} está cerrado: sus cursos ya no reciben asignaciones.`,
        );

      // Como en matrículas, tocar la fila evita una lectura anterior al bloqueo
      // en REPEATABLE READ: una asignación concurrente recibe 40001 y reintenta.
      // No cambia datos del curso ni genera auditoría de una edición ficticia.
      await db.query(`UPDATE convi.cursos SET estado = estado WHERE id = $1`, [
        cursoId,
      ]);

      // CA2: solo un profesor de la escuela; decisión del PO: Activo o Pendiente.
      const profesor = await db.query(
        `SELECT 1 FROM convi.membresias_establecimiento
         WHERE id = $1 AND codigo_perfil = 'PROFESOR'
           AND estado IN ('ACTIVO', 'PENDIENTE')`,
        [datos.membresia_id],
      );
      if (profesor.rows.length === 0)
        throw errorDeCampos(
          {
            membresia_id:
              'Elige un profesor de tu escuela con la cuenta activa o pendiente.',
          },
          'Revisa los datos marcados. No se guardó la asignación.',
        );

      // CA3: el mismo profesor no repite rol en el curso con fechas que se
      // cruzan. La base solo lo impide para asignaciones sin último día.
      const cruce = `daterange(a.fecha_inicio, a.fecha_fin, '[]')
                     && daterange($2::date, $3::date, '[]')`;
      const repetida = await db.query(
        `SELECT 1 FROM convi.asignaciones_docentes a
         WHERE a.curso_id = $1 AND a.membresia_id = $4
           AND a.rol_asignacion = $5 AND ${cruce}`,
        [
          cursoId,
          datos.fecha_inicio,
          datos.fecha_fin,
          datos.membresia_id,
          datos.rol,
        ],
      );
      if (repetida.rows.length > 0) throw new ConflictException(REPETIDA);

      // Decisión del PO: un solo profesor jefe vigente por curso.
      if (datos.rol === 'PROFESOR_JEFE') {
        const jefe = await db.query<{ nombre: string }>(
          `SELECT p.nombres || ' ' || p.apellidos AS nombre
           ${DESDE_ASIGNACIONES}
           WHERE a.curso_id = $1 AND a.rol_asignacion = 'PROFESOR_JEFE'
             AND ${cruce}
           LIMIT 1`,
          [cursoId, datos.fecha_inicio, datos.fecha_fin],
        );
        if (jefe.rows.length > 0)
          throw new ConflictException(
            `El curso ya tiene profesor jefe en esas fechas (${jefe.rows[0].nombre}). Termina esa asignación antes de asignar otro.`,
          );
      }

      const creada = await db.query<{ id: string }>(
        `INSERT INTO convi.asignaciones_docentes
           (establecimiento_id, curso_id, membresia_id, rol_asignacion,
            fecha_inicio, fecha_fin)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5)
         RETURNING id`,
        [
          cursoId,
          datos.membresia_id,
          datos.rol,
          datos.fecha_inicio,
          datos.fecha_fin,
        ],
      );
      return buscar(db, creada.rows[0].id);
    });
  }

  // CA4: registra el último día. Después de esa fecha el profesor ya no puede
  // registrar situaciones del curso (convi.puede_reportar_curso).
  terminar(
    sesion: Sesion,
    asignacionId: string,
    cuerpo: unknown,
  ): Promise<Asignacion> {
    const fechaFin = validarTermino(cuerpo);
    return this.operar(sesion, async (db) => {
      const actual = await db.query<{
        fecha_inicio: string | null;
        fecha_fin: string | null;
        terminada: boolean;
        anio: number;
        anio_estado: string;
      }>(
        `SELECT a.fecha_inicio::text AS fecha_inicio,
                a.fecha_fin::text AS fecha_fin,
                coalesce(a.fecha_fin < current_date, false) AS terminada,
                an.anio, an.estado AS anio_estado
         FROM convi.asignaciones_docentes a
         JOIN convi.cursos c ON c.id = a.curso_id
         JOIN convi.anios_academicos an ON an.id = c.anio_academico_id
         WHERE a.id = $1
         FOR UPDATE OF a FOR SHARE OF an`,
        [asignacionId],
      );
      if (actual.rows.length === 0)
        throw new NotFoundException('No encontramos esa asignación.');
      const asignacion = actual.rows[0];
      if (!ANIOS_EDITABLES.includes(asignacion.anio_estado))
        throw new ConflictException(
          `El año ${asignacion.anio} está cerrado: sus asignaciones ya no se modifican.`,
        );
      // Una asignación terminada no se reabre: para volver a asignar al
      // profesor se crea una nueva.
      if (asignacion.terminada)
        throw new ConflictException(
          `Esta asignación ya terminó el ${asignacion.fecha_fin}. Para volver a asignar al profesor, crea una asignación nueva.`,
        );
      if (asignacion.fecha_inicio && fechaFin < asignacion.fecha_inicio)
        throw errorDeCampos(
          {
            fecha_fin: `El último día no puede ser anterior al inicio (${asignacion.fecha_inicio}).`,
          },
          'Revisa los datos marcados. No se terminó la asignación.',
        );
      // Terminar solo adelanta el fin: alargarla podría cruzarse con otra
      // asignación del mismo rol (CA3 y un solo profesor jefe).
      if (asignacion.fecha_fin && fechaFin > asignacion.fecha_fin)
        throw errorDeCampos(
          {
            fecha_fin: `El último día no puede ser posterior al término ya registrado (${asignacion.fecha_fin}).`,
          },
          'Revisa los datos marcados. No se terminó la asignación.',
        );
      // La base guarda el antes y el después del cambio en eventos_auditoria.
      await db.query(
        `UPDATE convi.asignaciones_docentes SET fecha_fin = $2 WHERE id = $1`,
        [asignacionId, fechaFin],
      );
      return buscar(db, asignacionId);
    });
  }

  // Todas las rutas son del administrador y traducen igual los errores del modelo.
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

async function buscar(db: PoolClient, id: string) {
  const resultado = await db.query<Asignacion>(
    `SELECT ${COLUMNAS_ASIGNACION} ${DESDE_ASIGNACIONES} WHERE a.id = $1`,
    [id],
  );
  return resultado.rows[0];
}

// Convierte los errores conocidos del modelo en respuestas claras. Los demás
// siguen su curso: CuentaService.operar revierte y responde 503.
function traducirError(error: unknown) {
  const { code, constraint, message } = (error ?? {}) as ErrorPostgres;
  // CA3: la base impide repetir rol sin último día, aunque lleguen a la vez.
  if (
    code === '23505' &&
    constraint ===
      'asignaciones_docentes_curso_id_membresia_id_rol_asignacion_idx'
  )
    return new ConflictException(REPETIDA);
  // CA2: la base rechaza asignar una cuenta que no es de profesor.
  if (code === 'P0001' && message === 'La asignación requiere un profesor')
    return errorDeCampos(
      { membresia_id: 'Solo se pueden asignar cuentas de profesor.' },
      'Revisa los datos marcados. No se guardó la asignación.',
    );
  // Otra persona cambió el curso, la asignación o el año mientras se guardaba.
  if (code === '40001')
    return new ConflictException(
      'Los datos cambiaron mientras guardabas. Recarga la página e inténtalo de nuevo.',
    );
  return error;
}
