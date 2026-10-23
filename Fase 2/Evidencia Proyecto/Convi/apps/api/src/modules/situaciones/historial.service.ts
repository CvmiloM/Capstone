import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { validarFiltro } from '../academico/estudiante.js';
import {
  normalizarParcial,
  sinTildes,
} from '../academico/estudiantes.service.js';
import {
  aplicarFiltro,
  contarHistorial,
  ordenarHistorial,
  validarFiltroHistorial,
  type TipoRegistro,
} from './historial-estudiante.js';

// PB-074 (HU-064): historial de un estudiante para el equipo de Convivencia.
// Reúne las situaciones en que participó, incluidos los antecedentes sin
// caso, y los casos relacionados, activos y cerrados (CA1). CuentaService
// comprueba con convi.puede_ver_estudiante que sea de la escuela de la sesión
// y que la cuenta pueda verlo, así que otra escuela no se consulta (CA4).
const PERFILES: Perfil[] = ['CONVIVENCIA'];
const POR_PAGINA = 50;
/** Tope de registros que devuelve el historial; los totales cuentan todos. */
export const MAXIMO_HISTORIAL = 300;

export type EstudianteHistorial = {
  id: string;
  codigo_estudiante: string;
  nombres: string;
  apellidos: string;
  rut: string | null;
  /** ACTIVO, INACTIVO o EGRESADO. */
  estado: string;
  /** Curso y año de la matrícula activa hoy (HU-066 CA2). */
  curso_actual: string | null;
};

/** Un estudiante en la búsqueda, con cuántos registros tiene. */
export type EstudianteBuscado = EstudianteHistorial & {
  situaciones: number;
  casos: number;
};

export type ListaEstudiantes = {
  estudiantes: EstudianteBuscado[];
  total: number;
  pagina: number;
  por_pagina: number;
};

/** CA2: respaldo de un registro, con su archivo si lo tiene. */
export type Respaldo = {
  id: string;
  titulo: string;
  tipo: string;
  /** Fecha del documento o, si no la tiene, la de su carga. */
  fecha: Date;
  aportado_por: string;
  archivo: string | null;
  tamano_bytes: number | null;
  /** Corrige a otro respaldo, que se conserva (HU-063). */
  corrige: boolean;
};

type Comun = {
  id: string;
  codigo: string;
  estado: string;
  /** Día del hecho (o del inicio del caso) en la hora de la escuela. */
  fecha_dia: string;
  fecha_hecho: Date;
  fecha_registro: Date;
  autor: string;
  /** Curso y año que tenía el estudiante ese día; null si no se sabe (HU-066). */
  curso_al_ocurrir: string | null;
  /** Registro de un año anterior incorporado a mano (HU-065). */
  registro_historico: boolean;
  respaldos: Respaldo[];
};

export type SituacionHistorial = Comun & {
  tipo: 'SITUACION';
  categoria: string | null;
  urgencia: string;
  /** PROFESOR o CONVIVENCIA: quién la registró. */
  perfil_autor: string;
  /** Cómo participó el estudiante. */
  rol: string;
  /** Código del caso al que se vinculó, si se vinculó. */
  caso: string | null;
};

export type CasoHistorial = Comun & {
  tipo: 'CASO';
  titulo: string;
  cerrado_en: Date | null;
  /** Situaciones del estudiante que se vincularon al caso. */
  situaciones: string[];
};

export type RegistroHistorial = SituacionHistorial | CasoHistorial;

export type Historial = {
  estudiante: EstudianteHistorial;
  registros: RegistroHistorial[];
  /** Cantidad por tipo y estado, sin filtros. */
  conteo: { tipo: TipoRegistro; estado: string; total: number }[];
  /** Cuántos cumplen el filtro, aunque se muestren menos. */
  total_filtrado: number;
  limite: number;
};

// La matrícula activa hoy: a lo más una por estudiante (PB-017).
const CURSO_ACTUAL = `
  LEFT JOIN LATERAL (
    SELECT c.nombre || ' (' || an.anio || ')' AS curso
    FROM convi.matriculas m
    JOIN convi.cursos c ON c.id = m.curso_id
    JOIN convi.anios_academicos an ON an.id = m.anio_academico_id
    WHERE m.estudiante_id = e.id AND m.estado = 'ACTIVO'
    ORDER BY m.matriculado_en DESC
    LIMIT 1
  ) actual ON true`;

const COLUMNAS_ESTUDIANTE = `
  e.id, e.codigo_estudiante, p.nombres, p.apellidos, p.rut, e.estado,
  actual.curso AS curso_actual`;

// Las participaciones vigentes: una que se terminó (activo_hasta) ya no
// cuenta al estudiante en ese registro.
const SITUACIONES_DEL_ESTUDIANTE = `
  SELECT pa.situacion_id FROM convi.participaciones pa
  WHERE pa.persona_id = e.persona_id AND pa.situacion_id IS NOT NULL
    AND pa.activo_hasta IS NULL`;

// Un caso es del estudiante si participa en él o en una situación vinculada.
const CASOS_DEL_ESTUDIANTE = `
  SELECT pc.caso_id FROM convi.participaciones pc
  WHERE pc.persona_id = e.persona_id AND pc.caso_id IS NOT NULL
    AND pc.activo_hasta IS NULL
  UNION
  SELECT s.caso_id FROM convi.participaciones ps
  JOIN convi.situaciones s ON s.id = ps.situacion_id
  WHERE ps.persona_id = e.persona_id AND ps.activo_hasta IS NULL
    AND s.caso_id IS NOT NULL`;

@Injectable()
export class HistorialService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Para llegar al historial: estudiantes de la escuela por apellidos, de a
  // 50, buscando por nombre, código o RUT. Incluye a los que hoy no tienen
  // matrícula (retirados o egresados), porque su historial se conserva.
  buscar(
    sesion: Sesion,
    buscar: unknown,
    pagina: unknown,
  ): Promise<ListaEstudiantes> {
    const filtro = validarFiltro(buscar, undefined, pagina);
    // Los comodines que escriba la persona se buscan como texto.
    const texto = `%${filtro.buscar.replace(/[\\%_]/g, '\\$&')}%`;
    const rut = normalizarParcial(filtro.buscar);
    const donde = `
      WHERE $1 = '%%'
         OR ${sinTildes(`p.nombres || ' ' || p.apellidos`)} ILIKE ${sinTildes('$1')}
         OR ${sinTildes(`p.apellidos || ' ' || p.nombres`)} ILIKE ${sinTildes('$1')}
         OR e.codigo_estudiante ILIKE $1
         OR ($2 <> '' AND replace(p.rut, '-', '') LIKE $2)`;
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const total = await db.query<{ total: number }>(
          `SELECT count(*)::int AS total
           FROM convi.estudiantes e
           JOIN convi.personas p ON p.id = e.persona_id
           ${donde}`,
          [texto, rut],
        );
        const estudiantes = await db.query<EstudianteBuscado>(
          `SELECT ${COLUMNAS_ESTUDIANTE},
                  (SELECT count(DISTINCT x.situacion_id)
                     FROM (${SITUACIONES_DEL_ESTUDIANTE}) x)::int AS situaciones,
                  (SELECT count(*) FROM (${CASOS_DEL_ESTUDIANTE}) y)::int AS casos
           FROM convi.estudiantes e
           JOIN convi.personas p ON p.id = e.persona_id
           ${CURSO_ACTUAL}
           ${donde}
           ORDER BY p.apellidos, p.nombres, e.codigo_estudiante
           LIMIT ${POR_PAGINA} OFFSET $3`,
          [texto, rut, (filtro.pagina - 1) * POR_PAGINA],
        );
        return {
          estudiantes: estudiantes.rows,
          total: total.rows[0].total,
          pagina: filtro.pagina,
          por_pagina: POR_PAGINA,
        };
      },
    );
  }

  // CA1 a CA4: el historial completo del estudiante, filtrado por período y
  // estado. Se lee todo en la misma transacción, así que los totales y la
  // lista coinciden.
  historial(
    sesion: Sesion,
    id: string,
    consulta: {
      estado?: unknown;
      desde?: unknown;
      hasta?: unknown;
      orden?: unknown;
    },
  ): Promise<Historial> {
    const filtro = validarFiltroHistorial(consulta);
    return this.cuentas.operar(
      sesion,
      { tipo: 'estudiante', id, perfiles: PERFILES },
      async (db) => {
        const base = await db.query<EstudianteHistorial>(
          `SELECT ${COLUMNAS_ESTUDIANTE}
           FROM convi.estudiantes e
           JOIN convi.personas p ON p.id = e.persona_id
           ${CURSO_ACTUAL}
           WHERE e.id = $1`,
          [id],
        );
        const estudiante = base.rows[0];
        if (!estudiante)
          throw new NotFoundException('El estudiante no existe.');

        const situaciones = await leerSituaciones(db, id);
        const casos = await leerCasos(db, id);
        const todos: RegistroHistorial[] = [...situaciones, ...casos];
        const filtrados = ordenarHistorial(
          aplicarFiltro(todos, filtro),
          filtro.orden,
        );
        const mostrados = filtrados.slice(0, MAXIMO_HISTORIAL);
        await agregarRespaldos(db, mostrados);
        return {
          estudiante,
          registros: mostrados,
          conteo: contarHistorial(todos),
          total_filtrado: filtrados.length,
          limite: MAXIMO_HISTORIAL,
        };
      },
    );
  }
}

// CA1 y CA2: cada situación con su fecha del hecho, fecha de registro, autor,
// rol del estudiante y el curso que tenía ese día (PB-076). ::date usa la
// zona horaria de la escuela, que fija CuentaService.operar.
async function leerSituaciones(db: PoolClient, estudianteId: string) {
  const resultado = await db.query<Omit<SituacionHistorial, 'respaldos'>>(
    `SELECT DISTINCT ON (s.id)
            'SITUACION' AS tipo, s.id, s.codigo, s.estado, s.urgencia,
            s.ocurrido_en::date::text AS fecha_dia,
            s.ocurrido_en AS fecha_hecho, s.reportado_en AS fecha_registro,
            pr.nombres || ' ' || pr.apellidos AS autor,
            m.codigo_perfil AS perfil_autor,
            cat.nombre AS categoria, pa.rol_contextual AS rol,
            cm.nombre || ' (' || am.anio || ')' AS curso_al_ocurrir,
            s.registro_historico, ca.codigo AS caso
     FROM convi.estudiantes e
     JOIN convi.participaciones pa
       ON pa.persona_id = e.persona_id AND pa.situacion_id IS NOT NULL
      AND pa.activo_hasta IS NULL
     JOIN convi.situaciones s ON s.id = pa.situacion_id
     JOIN convi.membresias_establecimiento m ON m.id = s.reportado_por_membresia_id
     JOIN convi.personas pr ON pr.id = m.persona_id
     LEFT JOIN convi.categorias_convivencia cat ON cat.id = s.categoria_id
     LEFT JOIN convi.matriculas mt ON mt.id = pa.matricula_contexto_id
     LEFT JOIN convi.cursos cm ON cm.id = mt.curso_id
     LEFT JOIN convi.anios_academicos am ON am.id = cm.anio_academico_id
     LEFT JOIN convi.casos ca ON ca.id = s.caso_id
     WHERE e.id = $1
     ORDER BY s.id, pa.activo_desde`,
    [estudianteId],
  );
  return resultado.rows.map((fila) => ({ ...fila, respaldos: [] }));
}

// CA1 y CA2: cada caso con su fecha de inicio, fecha de registro y quién lo
// abrió. El curso es la matrícula guardada en su participación o, si el
// estudiante llegó al caso por una situación vinculada, la que tenía el día
// de inicio del caso (misma regla de PB-076).
async function leerCasos(db: PoolClient, estudianteId: string) {
  const resultado = await db.query<Omit<CasoHistorial, 'respaldos'>>(
    `SELECT 'CASO' AS tipo, c.id, c.codigo, c.titulo,
            c.estado_actual AS estado,
            c.fecha_inicio::text AS fecha_dia,
            c.fecha_inicio::timestamptz AS fecha_hecho,
            c.registrado_en AS fecha_registro, c.cerrado_en,
            pr.nombres || ' ' || pr.apellidos AS autor,
            coalesce(guardada.curso, vigente.curso) AS curso_al_ocurrir,
            c.registro_historico,
            coalesce((
              SELECT array_agg(s.codigo ORDER BY s.ocurrido_en, s.codigo)
              FROM convi.situaciones s
              WHERE s.caso_id = c.id
                AND s.id IN (${SITUACIONES_DEL_ESTUDIANTE})
            ), '{}') AS situaciones
     FROM convi.estudiantes e
     JOIN convi.casos c ON c.id IN (${CASOS_DEL_ESTUDIANTE})
     JOIN convi.membresias_establecimiento m ON m.id = c.abierto_por
     JOIN convi.personas pr ON pr.id = m.persona_id
     LEFT JOIN LATERAL (
       SELECT cm.nombre || ' (' || am.anio || ')' AS curso
       FROM convi.participaciones pc
       JOIN convi.matriculas mt ON mt.id = pc.matricula_contexto_id
       JOIN convi.cursos cm ON cm.id = mt.curso_id
       JOIN convi.anios_academicos am ON am.id = cm.anio_academico_id
       WHERE pc.caso_id = c.id AND pc.persona_id = e.persona_id
         AND pc.activo_hasta IS NULL
       ORDER BY pc.activo_desde
       LIMIT 1
     ) guardada ON true
     LEFT JOIN LATERAL (
       SELECT cm.nombre || ' (' || am.anio || ')' AS curso
       FROM convi.matriculas mt
       JOIN convi.cursos cm ON cm.id = mt.curso_id
       JOIN convi.anios_academicos am ON am.id = cm.anio_academico_id
       WHERE mt.estudiante_id = e.id
         AND mt.matriculado_en <= c.fecha_inicio
         AND (mt.finalizado_en IS NULL OR mt.finalizado_en >= c.fecha_inicio)
       ORDER BY mt.matriculado_en DESC
       LIMIT 1
     ) vigente ON true
     WHERE e.id = $1`,
    [estudianteId],
  );
  return resultado.rows.map((fila) => ({ ...fila, respaldos: [] }));
}

// CA2: los respaldos de cada registro que se muestra. Los de una situación
// incluyen los que se aportaron al responder sus aclaraciones; los de un
// caso, todo lo de su contexto (vw_evidencias_contexto). La descarga del
// archivo se autoriza aparte, en el servidor (PB-143).
async function agregarRespaldos(
  db: PoolClient,
  registros: RegistroHistorial[],
) {
  const situaciones = registros.filter((r) => r.tipo === 'SITUACION');
  const casos = registros.filter((r) => r.tipo === 'CASO');
  const columnas = `
    ev.id, ev.titulo, ev.tipo_evidencia AS tipo,
    coalesce(ev.fecha_documento, ev.creado_en) AS fecha,
    pp.nombres || ' ' || pp.apellidos AS aportado_por,
    ar.nombre_original AS archivo, ar.tamano_bytes::int AS tamano_bytes,
    ev.rectifica_evidencia_id IS NOT NULL AS corrige`;
  const autorYArchivo = `
    JOIN convi.membresias_establecimiento mm ON mm.id = ev.creado_por
    JOIN convi.personas pp ON pp.id = mm.persona_id
    LEFT JOIN convi.archivos ar ON ar.id = ev.archivo_id`;

  if (situaciones.length > 0) {
    const filas = await db.query<Respaldo & { registro_id: string }>(
      `SELECT coalesce(ev.situacion_id, ac.situacion_id) AS registro_id, ${columnas}
       FROM convi.evidencias ev
       LEFT JOIN convi.aclaraciones_situacion ac ON ac.id = ev.aclaracion_id
       ${autorYArchivo}
       WHERE coalesce(ev.situacion_id, ac.situacion_id) = ANY($1::uuid[])
       ORDER BY fecha, ev.creado_en, ev.id`,
      [situaciones.map((r) => r.id)],
    );
    repartir(situaciones, filas.rows);
  }
  if (casos.length > 0) {
    const filas = await db.query<Respaldo & { registro_id: string }>(
      `SELECT ev.caso_contexto_id AS registro_id, ${columnas}
       FROM convi.vw_evidencias_contexto ev
       ${autorYArchivo}
       WHERE ev.caso_contexto_id = ANY($1::uuid[])
       ORDER BY fecha, ev.creado_en, ev.id`,
      [casos.map((r) => r.id)],
    );
    repartir(casos, filas.rows);
  }
}

function repartir(
  registros: RegistroHistorial[],
  filas: (Respaldo & { registro_id: string })[],
) {
  const porId = new Map(registros.map((r) => [r.id, r]));
  for (const { registro_id, ...respaldo } of filas)
    porId.get(registro_id)?.respaldos.push(respaldo);
}