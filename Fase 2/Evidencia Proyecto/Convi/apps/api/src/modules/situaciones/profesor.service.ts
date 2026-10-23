import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  errorDeCampos,
  type NuevaSituacion,
  validarNuevaSituacion,
} from './nueva-situacion.js';
import {
  comprobarFechaYCategoria,
  conReintentosDeCodigo,
  insertarSituacion,
  matriculasAlOcurrir,
  type SituacionRegistrada,
} from './registro-situacion.js';
import { validarRespuesta } from './respuesta-aclaracion.js';

// PB-041 (HU-034): cursos y registros propios del profesor.
// La seguridad por fila de la base solo separa por escuela. Que el profesor vea
// únicamente sus cursos y sus propias situaciones lo aseguran estas consultas,
// filtrando por convi.membresia_actual(), que CuentaService.operar fija desde la sesión.
const PERFILES: Perfil[] = ['PROFESOR'];

export type CursoAsignado = {
  id: string;
  nombre: string;
  nivel: string;
  anio: number;
  roles: string[];
  estudiantes: number;
};

export type EstudianteDelCurso = {
  id: string;
  nombres: string;
  apellidos: string;
  codigo_estudiante: string;
};

export type SituacionPropia = {
  id: string;
  codigo: string;
  ocurrido_en: Date;
  reportado_en: Date;
  estado: string;
  urgencia: string;
  curso_id: string | null;
  curso: string | null;
  categoria: string | null;
  aclaraciones_pendientes: number;
};

export type DetalleSituacion = SituacionPropia & {
  lugar: string | null;
  descripcion: string;
  participantes: {
    nombres: string;
    apellidos: string;
    codigo_estudiante: string | null;
    rol: string;
  }[];
  evidencias: {
    id: string;
    titulo: string;
    tipo: string;
    creado_en: Date;
    archivo: string | null;
    /** PB-066: para mostrarla y descargarla. */
    descripcion: string | null;
    tamano_bytes: number | null;
    origen: string;
  }[];
  aclaraciones: {
    id: string;
    pregunta: string;
    solicitado_en: Date;
    estado: string;
    respuesta: string | null;
    respondido_en: Date | null;
  }[];
};

export type Categoria = {
  id: string;
  nombre: string;
};

export type AclaracionRespondida = {
  id: string;
  situacion_id: string;
  estado: string;
  respondido_en: Date;
  /** Estado de la situación después de responder (HU-042 CA4). */
  estado_situacion: string;
};

const YA_RESPONDIDA =
  'Esta aclaración ya fue respondida. La respuesta enviada se conserva y no se puede cambiar.';

// PB-139: si otra petición cambió la misma fila después de que empezó esta
// transacción, PostgreSQL rechaza el cambio (40001) en vez de sobrescribirlo.
function esCambioSimultaneo(error: unknown) {
  return (error as { code?: string } | null)?.code === '40001';
}

// Columnas comunes del listado y del detalle. Nunca incluye caso_id ni quién
// revisa la situación: esa información es de Convivencia (HU-034 CA3).
const COLUMNAS_SITUACION = `
  s.id, s.codigo, s.ocurrido_en, s.reportado_en, s.estado, s.urgencia,
  s.curso_contexto_id AS curso_id, c.nombre AS curso,
  cat.nombre AS categoria,
  (SELECT count(*) FROM convi.aclaraciones_situacion a
    WHERE a.situacion_id = s.id
      AND a.profesor_destinatario_id = convi.membresia_actual()
      AND a.estado = 'PENDIENTE')::int AS aclaraciones_pendientes`;

const DESDE_SITUACIONES = `
  FROM convi.situaciones s
  LEFT JOIN convi.cursos c ON c.id = s.curso_contexto_id
  LEFT JOIN convi.categorias_convivencia cat ON cat.id = s.categoria_id`;

@Injectable()
export class ProfesorService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // CA1: solo cursos con una asignación vigente hoy, con la cantidad de matrículas activas.
  cursos(sesion: Sesion): Promise<CursoAsignado[]> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<CursoAsignado>(
          // PB-144: solo lo que muestran Mis cursos y el formulario, sin ficha administrativa.
          `SELECT c.id, c.nombre, n.nombre AS nivel, an.anio,
                  array_agg(DISTINCT ad.rol_asignacion) AS roles,
                  (SELECT count(*) FROM convi.matriculas m
                    WHERE m.curso_id = c.id AND m.estado = 'ACTIVO')::int AS estudiantes
           FROM convi.asignaciones_docentes ad
           JOIN convi.cursos c ON c.id = ad.curso_id
           JOIN convi.niveles_educativos n ON n.id = c.nivel_id
           JOIN convi.anios_academicos an ON an.id = c.anio_academico_id
           WHERE ad.membresia_id = convi.membresia_actual()
             AND (ad.fecha_inicio IS NULL OR ad.fecha_inicio <= current_date)
             AND (ad.fecha_fin IS NULL OR ad.fecha_fin >= current_date)
           GROUP BY c.id, n.nombre, n.orden, an.anio
           ORDER BY an.anio DESC, n.orden, c.seccion NULLS FIRST, c.nombre`,
        );
        return resultado.rows;
      },
    );
  }

  // CA1: estudiantes matriculados en un curso del profesor. curso_reporte usa
  // convi.puede_reportar_curso, que exige la asignación vigente. Solo se
  // devuelven los datos necesarios: sin RUT ni contacto (HU-123).
  estudiantes(sesion: Sesion, cursoId: string): Promise<EstudianteDelCurso[]> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'curso_reporte', id: cursoId, perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<EstudianteDelCurso>(
          `SELECT e.id, p.nombres, p.apellidos, e.codigo_estudiante
           FROM convi.matriculas m
           JOIN convi.estudiantes e ON e.id = m.estudiante_id
           JOIN convi.personas p ON p.id = e.persona_id
           WHERE m.curso_id = $1 AND m.estado = 'ACTIVO'
           ORDER BY p.apellidos, p.nombres`,
          [cursoId],
        );
        return resultado.rows;
      },
    );
  }

  // PB-042 (HU-035): categorías activas para el formulario. Las inactivas no se
  // ofrecen en situaciones nuevas (HU-023).
  categorias(sesion: Sesion): Promise<Categoria[]> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<Categoria>(
          `SELECT id, nombre
           FROM convi.categorias_convivencia
           WHERE estado = 'ACTIVO'
           ORDER BY nombre`,
        );
        return resultado.rows;
      },
    );
  }

  // PB-042 (HU-035) y PB-138: registra la situación y a sus participantes en una
  // sola transacción. Si algo falla no queda una situación sin estudiantes.
  registrar(sesion: Sesion, cuerpo: unknown): Promise<SituacionRegistrada> {
    const datos = validarNuevaSituacion(cuerpo);
    return conReintentosDeCodigo(() => this.guardarSituacion(sesion, datos));
  }

  // CA1: curso_reporte usa convi.puede_reportar_curso, que exige la asignación
  // vigente; el trigger de convi.situaciones lo vuelve a comprobar al insertar.
  private guardarSituacion(
    sesion: Sesion,
    datos: NuevaSituacion,
  ): Promise<SituacionRegistrada> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'curso_reporte', id: datos.curso_id, perfiles: PERFILES },
      async (db) => {
        const errores: Record<string, string> = {};
        const ocurridoEn = await comprobarFechaYCategoria(db, datos, errores);

        // CA1: el profesor elige entre los estudiantes matriculados hoy en su curso.
        const estudianteIds = datos.participantes.map((p) => p.estudiante_id);
        const delCurso = await db.query(
          `SELECT 1 FROM convi.matriculas
           WHERE curso_id = $1 AND estado = 'ACTIVO'
             AND estudiante_id = ANY($2::uuid[])`,
          [datos.curso_id, estudianteIds],
        );
        if (delCurso.rowCount !== datos.participantes.length)
          errores.participantes =
            'Hay estudiantes que no están matriculados en este curso.';

        // CA5: si falta algo no se inserta nada.
        if (!ocurridoEn || Object.keys(errores).length > 0)
          throw errorDeCampos(errores);

        // CA4 y PB-076 (HU-066): se guarda la matrícula del día del hecho, que
        // puede ser de otro curso si el estudiante cambió de curso después.
        const alOcurrir = await matriculasAlOcurrir(
          db,
          estudianteIds,
          ocurridoEn,
        );

        return insertarSituacion(
          db,
          {
            curso_id: datos.curso_id,
            tipo_origen: 'PROFESOR',
            persona_origen_id: null,
            ocurrido_en: ocurridoEn,
            lugar: datos.lugar,
            descripcion: datos.descripcion,
            categoria_id: datos.categoria_id,
            urgencia: datos.urgencia,
          },
          datos.participantes.map((p) => ({
            rol: p.rol,
            ...alOcurrir.get(p.estudiante_id)!,
          })),
        );
      },
    );
  }

  // CA2: las situaciones que registró este profesor, de la más reciente a la más antigua.
  situaciones(sesion: Sesion): Promise<SituacionPropia[]> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<SituacionPropia>(
          `SELECT ${COLUMNAS_SITUACION}
           ${DESDE_SITUACIONES}
           WHERE s.reportado_por_membresia_id = convi.membresia_actual()
           ORDER BY s.reportado_en DESC`,
        );
        return resultado.rows;
      },
    );
  }

  // CA2 y CA3: detalle de una situación propia. Si la registró otra persona se
  // rechaza con el mismo mensaje que si no existiera, para no revelar nada.
  situacion(sesion: Sesion, situacionId: string): Promise<DetalleSituacion> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const base = await db.query<
          SituacionPropia & { lugar: string | null; descripcion: string }
        >(
          `SELECT ${COLUMNAS_SITUACION}, s.lugar, s.descripcion
           ${DESDE_SITUACIONES}
           WHERE s.id = $1
             AND s.reportado_por_membresia_id = convi.membresia_actual()`,
          [situacionId],
        );
        const situacion = base.rows[0];
        if (!situacion)
          throw new ForbiddenException('No tienes permiso para este registro.');

        const participantes = await db.query<
          DetalleSituacion['participantes'][number]
        >(
          `SELECT p.nombres, p.apellidos, e.codigo_estudiante,
                  pa.rol_contextual AS rol
           FROM convi.participaciones pa
           JOIN convi.personas p ON p.id = pa.persona_id
           LEFT JOIN convi.estudiantes e ON e.persona_id = p.id
           WHERE pa.situacion_id = $1
           ORDER BY p.apellidos, p.nombres`,
          [situacionId],
        );
        // Solo las evidencias que aportó el profesor: en la situación o al responder aclaraciones.
        const evidencias = await db.query<
          DetalleSituacion['evidencias'][number]
        >(
          `SELECT ev.id, ev.titulo, ev.tipo_evidencia AS tipo, ev.creado_en,
                  ar.nombre_original AS archivo, ev.descripcion,
                  ar.tamano_bytes::int AS tamano_bytes,
                  CASE WHEN ev.aclaracion_id IS NULL THEN 'Situación'
                       ELSE 'Respuesta a una aclaración' END AS origen
           FROM convi.evidencias ev
           LEFT JOIN convi.archivos ar ON ar.id = ev.archivo_id
           WHERE ev.creado_por = convi.membresia_actual()
             AND (ev.situacion_id = $1
               OR ev.aclaracion_id IN (SELECT a.id FROM convi.aclaraciones_situacion a
                                       WHERE a.situacion_id = $1))
           ORDER BY ev.creado_en`,
          [situacionId],
        );
        const aclaraciones = await db.query<
          DetalleSituacion['aclaraciones'][number]
        >(
          `SELECT a.id, a.pregunta, a.solicitado_en, a.estado, a.respuesta,
                  a.respondido_en
           FROM convi.aclaraciones_situacion a
           WHERE a.situacion_id = $1
             AND a.profesor_destinatario_id = convi.membresia_actual()
           ORDER BY a.solicitado_en`,
          [situacionId],
        );
        return {
          ...situacion,
          participantes: participantes.rows,
          evidencias: evidencias.rows,
          aclaraciones: aclaraciones.rows,
        };
      },
    );
  }

  // PB-049 (HU-042): el profesor responde una aclaración que le pidió
  // Convivencia. La base pone la fecha del servidor, impide modificar una
  // respuesta enviada y, si era la última pendiente, devuelve la situación a
  // En revisión (CA4).
  responderAclaracion(
    sesion: Sesion,
    aclaracionId: string,
    cuerpo: unknown,
  ): Promise<AclaracionRespondida> {
    const respuesta = validarRespuesta(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        // FOR UPDATE bloquea la aclaración: si dos envíos llegan a la vez, el
        // segundo espera y luego recibe 40001, que se informa como ya respondida.
        const actual = await db
          .query<{ estado: string }>(
            `SELECT estado FROM convi.aclaraciones_situacion
             WHERE id = $1 AND profesor_destinatario_id = convi.membresia_actual()
             FOR UPDATE`,
            [aclaracionId],
          )
          .catch((error: unknown) => {
            if (esCambioSimultaneo(error))
              throw new ConflictException(YA_RESPONDIDA);
            throw error;
          });
        const aclaracion = actual.rows[0];
        // CA3: si no es para este profesor se rechaza igual que si no existiera.
        if (!aclaracion)
          throw new ForbiddenException('No tienes permiso para este registro.');
        if (aclaracion.estado !== 'PENDIENTE')
          throw new ConflictException(YA_RESPONDIDA);

        // CA1: guarda la respuesta y quién respondió; respondido_en lo pone la base.
        const respondida = await db.query<
          Omit<AclaracionRespondida, 'estado_situacion'>
        >(
          `UPDATE convi.aclaraciones_situacion
           SET estado = 'RESPONDIDA', respuesta = $2,
               respondido_por = convi.membresia_actual()
           WHERE id = $1
           RETURNING id, situacion_id, estado, respondido_en`,
          [aclaracionId, respuesta],
        );
        const fila = respondida.rows[0];
        const situacion = await db.query<{ estado: string }>(
          'SELECT estado FROM convi.situaciones WHERE id = $1',
          [fila.situacion_id],
        );
        return { ...fila, estado_situacion: situacion.rows[0].estado };
      },
    );
  }
}
