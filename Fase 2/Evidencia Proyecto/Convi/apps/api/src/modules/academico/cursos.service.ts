import { codigoAutomatico } from './codigo-automatico.js';
import { objeto, texto } from './curso.js';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { consultarAnios } from './anios.service.js';
import { consultarNiveles } from './niveles.service.js';
import {
  type Asignacion,
  COLUMNAS_ASIGNACION,
  DESDE_ASIGNACIONES,
} from './asignaciones.service.js';
import {
  ANIOS_EDITABLES,
  errorDeCampos,
  esUuid,
  motivoDeCorreccion,
  validarCurso,
  validarNuevoCurso,
} from './curso.js';

// PB-015 (HU-013): cursos de cada año de la escuela del administrador. La
// escuela nunca viene del navegador: CuentaService.operar fija la escuela de
// la sesión y la seguridad por fila oculta las demás (PB-141).
const PERFILES: Perfil[] = ['ADMIN'];

export type Curso = {
  id: string;
  codigo: string;
  nombre: string;
  seccion: string | null;
  estado: string;
  anio_academico_id: string;
  anio: number;
  anio_estado: string;
  nivel_id: string;
  nivel_codigo: string;
  nivel_nombre: string;
  nivel_activo: boolean;
  /** Matrículas activas del curso. */
  estudiantes: number;
  /** Todas las matrículas, también las terminadas: con alguna, el nivel ya no cambia. */
  matriculas: number;
  /** Nombre del profesor jefe vigente hoy, si hay. */
  profesor_jefe: string | null;
  /** Profesores con una asignación vigente hoy. */
  profesores: number;
};

export type DetalleCurso = Curso & { asignaciones: Asignacion[] };

type ErrorPostgres = { code?: string; constraint?: string; message?: string };

// Mismo criterio de vigencia que usa la base en convi.puede_reportar_curso.
const VIGENTE = `(a.fecha_inicio IS NULL OR a.fecha_inicio <= current_date)
  AND (a.fecha_fin IS NULL OR a.fecha_fin >= current_date)`;

const COLUMNAS = `
  c.id, c.codigo, c.nombre, c.seccion, c.estado,
  c.anio_academico_id, an.anio, an.estado AS anio_estado,
  c.nivel_id, n.codigo AS nivel_codigo, n.nombre AS nivel_nombre,
  n.activo AS nivel_activo,
  (SELECT count(*) FROM convi.matriculas m
    WHERE m.curso_id = c.id AND m.estado = 'ACTIVO')::int AS estudiantes,
  (SELECT count(*) FROM convi.matriculas m
    WHERE m.curso_id = c.id)::int AS matriculas,
  (SELECT p.nombres || ' ' || p.apellidos
     FROM convi.asignaciones_docentes a
     JOIN convi.membresias_establecimiento me ON me.id = a.membresia_id
     JOIN convi.personas p ON p.id = me.persona_id
    WHERE a.curso_id = c.id AND a.rol_asignacion = 'PROFESOR_JEFE'
      AND ${VIGENTE}
    LIMIT 1) AS profesor_jefe,
  (SELECT count(DISTINCT a.membresia_id) FROM convi.asignaciones_docentes a
    WHERE a.curso_id = c.id AND ${VIGENTE})::int AS profesores`;

const DESDE = `
  FROM convi.cursos c
  JOIN convi.anios_academicos an ON an.id = c.anio_academico_id
  JOIN convi.niveles_educativos n ON n.id = c.nivel_id`;

async function consultarCursos(db: PoolClient, anioId: string) {
  const resultado = await db.query<Curso>(
    `SELECT ${COLUMNAS} ${DESDE}
     WHERE c.anio_academico_id = $1
     ORDER BY n.orden, c.codigo`,
    [anioId],
  );
  return resultado.rows;
}

@Injectable()
export class CursosService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Una carga de pantalla: misma autorización, conexión y fotografía de la escuela.
  vista(sesion: Sesion, anioPedido: unknown) {
    return this.operar(sesion, async (db) => {
      const anios = await consultarAnios(db);
      const anio =
        anios.find((a) => a.id === anioPedido) ??
        anios.find((a) => a.estado === 'ACTIVO') ??
        anios[0] ??
        null;
      const niveles = anio ? await consultarNiveles(db) : [];
      const cursos = anio ? await consultarCursos(db, anio.id) : [];
      return { anios, anio, niveles, cursos };
    });
  }

  // Cursos de un año, en el orden de sus niveles y por código.
  listar(sesion: Sesion, anioId: unknown): Promise<Curso[]> {
    const anio = typeof anioId === 'string' ? anioId.toLowerCase() : '';
    if (!esUuid(anio))
      throw errorDeCampos(
        { anio: 'Elige un año académico.' },
        'Indica de qué año quieres ver los cursos.',
      );
    return this.operar(sesion, (db) => consultarCursos(db, anio));
  }

  // El curso con todas sus asignaciones, primero las vigentes.
  obtener(sesion: Sesion, id: string): Promise<DetalleCurso> {
    return this.operar(sesion, async (db) => {
      const resultado = await db.query<Curso>(
        `SELECT ${COLUMNAS} ${DESDE} WHERE c.id = $1`,
        [id],
      );
      if (resultado.rows.length === 0)
        throw new NotFoundException('No encontramos ese curso.');
      const asignaciones = await db.query<Asignacion>(
        `SELECT ${COLUMNAS_ASIGNACION} ${DESDE_ASIGNACIONES}
         WHERE a.curso_id = $1
         ORDER BY a.fecha_fin < current_date NULLS FIRST,
                  a.rol_asignacion = 'PROFESOR_JEFE' DESC,
                  p.apellidos, p.nombres`,
        [id],
      );
      return { ...resultado.rows[0], asignaciones: asignaciones.rows };
    });
  }

  // CA1: el curso pertenece a un año y a un nivel de la escuela. Decisión del
  // PO: solo se crean cursos en años Planificados o Activos.
  crear(sesion: Sesion, cuerpo: unknown): Promise<Curso> {
    const entrada = objeto(cuerpo);
    const datos = validarNuevoCurso({
      ...entrada,
      codigo: texto(entrada.codigo) || 'AUTO',
    });
    return this.operar(
      sesion,
      async (db) => {
        // FOR SHARE impide que el año se cierre mientras se crea el curso.
        const anio = await db.query<{ anio: number; estado: string }>(
          `SELECT anio, estado FROM convi.anios_academicos
         WHERE id = $1 FOR SHARE`,
          [datos.anio_academico_id],
        );
        if (anio.rows.length === 0)
          throw errorDeCampos({
            anio_academico_id: 'Elige un año académico de tu escuela.',
          });
        if (!ANIOS_EDITABLES.includes(anio.rows[0].estado))
          throw errorDeCampos({
            anio_academico_id: `El año ${anio.rows[0].anio} está cerrado: ya no se le agregan cursos.`,
          });
        await revisarNivel(db, datos.nivel_id);
        if (!texto(entrada.codigo))
          datos.codigo = await codigoAutomatico(
            db,
            'curso',
            datos.anio_academico_id,
          );
        await revisarSeccion(
          db,
          datos.anio_academico_id,
          datos.nivel_id,
          datos.seccion,
        );
        const creado = await db.query<{ id: string }>(
          `INSERT INTO convi.cursos
           (establecimiento_id, anio_academico_id, nivel_id, codigo, nombre, seccion)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5)
         RETURNING id`,
          [
            datos.anio_academico_id,
            datos.nivel_id,
            datos.codigo,
            datos.nombre,
            datos.seccion,
          ],
        );
        return buscar(db, creado.rows[0].id);
      },
      'READ COMMITTED',
    );
  }

  // Decisión del PO: el código, el nombre y la sección cambian siempre; el
  // nivel, solo si el curso no tiene estudiantes; el año, nunca.
  editar(sesion: Sesion, id: string, cuerpo: unknown): Promise<Curso> {
    const datos = validarCurso(cuerpo);
    return this.operar(
      sesion,
      async (db) => {
        const actual = await db.query<Curso>(
          `SELECT ${COLUMNAS} ${DESDE}
         WHERE c.id = $1
         FOR UPDATE OF c FOR SHARE OF an`,
          [id],
        );
        if (actual.rows.length === 0)
          throw new NotFoundException('No encontramos ese curso.');
        const curso = actual.rows[0];
        // PB-023 (HU-018 CA1): en un año Cerrado solo como corrección con motivo.
        const motivo = motivoDeCorreccion(
          cuerpo,
          curso.anio,
          curso.anio_estado,
          'Revisa los datos marcados. No se guardó el curso.',
        );
        if (motivo)
          await db.query("SELECT set_config('app.motivo_cambio', $1, true)", [
            motivo,
          ]);
        if (datos.nivel_id !== curso.nivel_id) {
          if (curso.matriculas > 0)
            throw errorDeCampos({
              nivel_id:
                'No se puede cambiar porque el curso ya tiene estudiantes.',
            });
          await revisarNivel(db, datos.nivel_id);
        }
        await revisarSeccion(
          db,
          curso.anio_academico_id,
          datos.nivel_id,
          datos.seccion,
          id,
        );
        await db.query(
          `UPDATE convi.cursos
         SET codigo = $2, nombre = $3, seccion = $4, nivel_id = $5
         WHERE id = $1`,
          [id, datos.codigo, datos.nombre, datos.seccion, datos.nivel_id],
        );
        return buscar(db, id);
      },
      'READ COMMITTED',
    );
  }

  // Todas las rutas son del administrador y traducen igual los errores del modelo.
  private operar<T>(
    sesion: Sesion,
    trabajo: (db: PoolClient) => Promise<T>,
    aislamiento: 'REPEATABLE READ' | 'READ COMMITTED' = 'REPEATABLE READ',
  ) {
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
      aislamiento,
    );
  }
}

async function buscar(db: PoolClient, id: string) {
  const resultado = await db.query<Curso>(
    `SELECT ${COLUMNAS} ${DESDE} WHERE c.id = $1`,
    [id],
  );
  return resultado.rows[0];
}

// CA1: el nivel es de la escuela (la seguridad por fila oculta los de otras)
// y, para un curso nuevo o un cambio de nivel, está activo (PB-014). La base
// también lo revisa, pero con un solo mensaje para ambos casos.
async function revisarNivel(db: PoolClient, nivelId: string) {
  const nivel = await db.query<{ activo: boolean }>(
    `SELECT activo FROM convi.niveles_educativos WHERE id = $1`,
    [nivelId],
  );
  if (nivel.rows.length === 0)
    throw errorDeCampos({ nivel_id: 'Elige un nivel de tu escuela.' });
  if (!nivel.rows[0].activo)
    throw errorDeCampos({
      nivel_id: 'Ese nivel está desactivado. Elige uno activo.',
    });
}

// Convierte los errores conocidos del modelo en respuestas claras. Los demás
// siguen su curso: CuentaService.operar revierte y responde 503.
function traducirError(error: unknown) {
  const { code, constraint, message } = (error ?? {}) as ErrorPostgres;
  // CA1: el código no se repite dentro del año.
  if (
    code === '23505' &&
    constraint === 'cursos_establecimiento_id_anio_academico_id_codigo_key'
  )
    return errorDeCampos({
      codigo: 'Ese código ya lo usa otro curso de ese año.',
    });
  // PB-014 (CA2): un nivel desactivado no se usa en cursos nuevos; llega aquí
  // si otra persona lo desactivó mientras se guardaba.
  if (code === 'P0001' && message?.startsWith('El nivel está desactivado'))
    return errorDeCampos({
      nivel_id: 'Ese nivel está desactivado. Elige uno activo.',
    });
  // Otra persona cambió el curso o el año mientras se guardaba.
  if (code === '40001')
    return new ConflictException(
      'El curso cambió mientras guardabas. Recarga la página e inténtalo de nuevo.',
    );
  return error;
}

async function revisarSeccion(
  db: PoolClient,
  anio: string,
  nivel: string,
  seccion: string | null,
  id: string | null = null,
) {
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('curso-seccion:' || convi.establecimiento_actual()::text || ':' || $1, 0))",
    [anio],
  );
  const repetido = await db.query(
    `SELECT 1 FROM convi.cursos
    WHERE establecimiento_id = convi.establecimiento_actual() AND anio_academico_id = $1 AND nivel_id = $2
      AND upper(coalesce(seccion, '')) = upper(coalesce($3::text, ''))
      AND ($4::uuid IS NULL OR id <> $4) LIMIT 1`,
    [anio, nivel, seccion, id],
  );
  if (repetido.rowCount)
    throw errorDeCampos({
      seccion:
        'Ya existe un curso de ese nivel y sección en este año, revisa el curso registrado',
    });
}
