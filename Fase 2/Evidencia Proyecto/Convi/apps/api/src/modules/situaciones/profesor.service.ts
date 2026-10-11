import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';

// PB-041 (HU-034): cursos y registros propios del profesor.
// La seguridad por fila de la base solo separa por escuela. Que el profesor vea
// únicamente sus cursos y sus propias situaciones lo aseguran estas consultas,
// filtrando por convi.membresia_actual(), que CuentaService.operar fija desde la sesión.
const PERFILES: Perfil[] = ['PROFESOR'];

export type CursoAsignado = {
  id: string;
  codigo: string;
  nombre: string;
  seccion: string | null;
  nivel: string;
  anio: number;
  estado: string;
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

// Columnas comunes del listado y del detalle. Nunca incluye caso_id ni quién
// revisa la situación: esa información es de Convivencia (HU-034 CA3).
const COLUMNAS_SITUACION = `
  s.id, s.codigo, s.ocurrido_en, s.reportado_en, s.estado, s.urgencia,
  c.nombre AS curso,
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
          `SELECT c.id, c.codigo, c.nombre, c.seccion, n.nombre AS nivel,
                  an.anio, c.estado,
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
                  ar.nombre_original AS archivo
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
}
