import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  normalizarParcial,
  sinTildes,
} from '../academico/estudiantes.service.js';
import {
  comoPatron,
  POR_PAGINA_EXPEDIENTES,
  validarBusquedaExpedientes,
  type FiltroExpedientes,
} from './busqueda-expedientes.js';
import type { TipoRegistro } from './historial-estudiante.js';

// PB-077 (HU-067): búsqueda de situaciones y casos de la escuela por código,
// estudiante, estado y período, en una sola lista. Solo la usa Convivencia y
// la seguridad por fila de la base limita todo a la escuela de la sesión, así
// que un nombre que coincide con alguien de otra escuela no trae nada (CA2).
const PERFILES: Perfil[] = ['CONVIVENCIA'];

type Comun = {
  id: string;
  codigo: string;
  estado: string;
  /** Día del hecho (o del inicio del caso) en la hora de la escuela. */
  fecha_dia: string;
  fecha_hecho: Date;
  fecha_registro: Date;
  /** Registro de un año anterior incorporado a mano (HU-065). */
  registro_historico: boolean;
  /** Estudiantes que participan, por apellido. */
  estudiantes: string[];
  /** CA3: curso y año que tenían sus estudiantes, todos si son varios. */
  cursos: string[];
  /** Algún estudiante no tenía matrícula ese día (HU-066). */
  curso_sin_registro: boolean;
};

export type SituacionEncontrada = Comun & {
  tipo: 'SITUACION';
  categoria: string | null;
  urgencia: string;
  /** Caso al que se vinculó, si se vinculó. */
  caso: { id: string; codigo: string } | null;
};

export type CasoEncontrado = Comun & {
  tipo: 'CASO';
  titulo: string;
  categoria: string | null;
  responsable: string;
  situaciones: number;
  cerrado_en: Date | null;
};

export type ExpedienteEncontrado = SituacionEncontrada | CasoEncontrado;

export type ResultadoBusqueda = {
  resultados: ExpedienteEncontrado[];
  /** Cuántos cumplen todos los filtros. */
  total: number;
  /** Cantidad por tipo y estado con los demás filtros, para el selector. */
  conteo: { tipo: TipoRegistro; estado: string; total: number }[];
  pagina: number;
  por_pagina: number;
};

type Fila = Pick<
  Comun,
  'id' | 'codigo' | 'estado' | 'fecha_dia' | 'fecha_hecho' | 'fecha_registro'
> & { tipo: TipoRegistro };

// $1 código con comodines, $2 estudiante con comodines, $3 RUT sin guion con
// comodín ('' si no parece RUT), $4 y $5 el período. Un null no filtra.
// ::date usa la zona horaria de la escuela, que fija CuentaService.operar.
// Las participaciones terminadas (activo_hasta) ya no cuentan al estudiante.
const EXPEDIENTES = `
  WITH coinciden AS (
    SELECT e.persona_id
    FROM convi.estudiantes e
    JOIN convi.personas p ON p.id = e.persona_id
    WHERE ${sinTildes(`p.nombres || ' ' || p.apellidos`)} ILIKE ${sinTildes('$2::text')}
       OR ${sinTildes(`p.apellidos || ' ' || p.nombres`)} ILIKE ${sinTildes('$2::text')}
       OR e.codigo_estudiante ILIKE $2::text
       OR ($3::text <> '' AND replace(p.rut, '-', '') LIKE $3::text)
  ),
  expedientes AS (
    SELECT 'SITUACION'::text AS tipo, s.id, s.codigo, s.estado::text AS estado,
           s.ocurrido_en::date AS dia, s.ocurrido_en AS fecha_hecho,
           s.reportado_en AS fecha_registro
    FROM convi.situaciones s
    WHERE ($1::text IS NULL OR s.codigo ILIKE $1::text)
      AND ($4::date IS NULL OR s.ocurrido_en::date >= $4::date)
      AND ($5::date IS NULL OR s.ocurrido_en::date <= $5::date)
      AND ($2::text IS NULL OR EXISTS (
        SELECT 1 FROM convi.participaciones pa
        JOIN coinciden k ON k.persona_id = pa.persona_id
        WHERE pa.situacion_id = s.id AND pa.activo_hasta IS NULL))
    UNION ALL
    -- Un caso es del estudiante si participa en él o en una de sus situaciones.
    SELECT 'CASO', c.id, c.codigo, c.estado_actual::text,
           c.fecha_inicio, c.fecha_inicio::timestamptz, c.registrado_en
    FROM convi.casos c
    WHERE ($1::text IS NULL OR c.codigo ILIKE $1::text)
      AND ($4::date IS NULL OR c.fecha_inicio >= $4::date)
      AND ($5::date IS NULL OR c.fecha_inicio <= $5::date)
      AND ($2::text IS NULL
        OR EXISTS (
          SELECT 1 FROM convi.participaciones pc
          JOIN coinciden k ON k.persona_id = pc.persona_id
          WHERE pc.caso_id = c.id AND pc.activo_hasta IS NULL)
        OR EXISTS (
          SELECT 1 FROM convi.situaciones sv
          JOIN convi.participaciones ps
            ON ps.situacion_id = sv.id AND ps.activo_hasta IS NULL
          JOIN coinciden k ON k.persona_id = ps.persona_id
          WHERE sv.caso_id = c.id))
  )`;

// Curso y año ordenados por año; el mismo curso se muestra una vez.
const cursosDe = (desde: string) => `
  coalesce((SELECT array_agg(x.curso ORDER BY x.anio, x.curso) FROM (
    SELECT DISTINCT cu.nombre || ' (' || an.anio || ')' AS curso, an.anio
    ${desde}) x), '{}')`;

const nombresDe = (personas: string) => `
  coalesce((SELECT array_agg(x.nombres || ' ' || x.apellidos
                             ORDER BY x.apellidos, x.nombres) FROM (
    SELECT DISTINCT pe.id, pe.nombres, pe.apellidos
    FROM (${personas}) q
    JOIN convi.estudiantes e ON e.persona_id = q.persona_id
    JOIN convi.personas pe ON pe.id = q.persona_id) x), '{}')`;

const PARTICIPAN_SITUACION = `
  SELECT pa.persona_id, pa.matricula_contexto_id FROM convi.participaciones pa
  WHERE pa.situacion_id = s.id AND pa.activo_hasta IS NULL`;

const PARTICIPAN_CASO = `
  SELECT pc.persona_id, pc.matricula_contexto_id FROM convi.participaciones pc
  WHERE pc.caso_id = c.id AND pc.activo_hasta IS NULL
  UNION
  SELECT ps.persona_id, ps.matricula_contexto_id FROM convi.situaciones sv
  JOIN convi.participaciones ps
    ON ps.situacion_id = sv.id AND ps.activo_hasta IS NULL
  WHERE sv.caso_id = c.id`;

const sinCursoEn = (personas: string) => `
  EXISTS (SELECT 1 FROM (${personas}) q
          JOIN convi.estudiantes e ON e.persona_id = q.persona_id
          WHERE q.matricula_contexto_id IS NULL)`;

@Injectable()
export class ExpedientesService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // CA1 a CA3: la lista y los totales se leen en la misma transacción, así
  // que coinciden. Los más recientes primero, de a 50.
  buscar(
    sesion: Sesion,
    consulta: {
      codigo?: unknown;
      estudiante?: unknown;
      estado?: unknown;
      desde?: unknown;
      hasta?: unknown;
      pagina?: unknown;
    },
  ): Promise<ResultadoBusqueda> {
    const filtro = validarBusquedaExpedientes(consulta);
    const parametros = parametrosDe(filtro);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const conteo = await db.query<ResultadoBusqueda['conteo'][number]>(
          `${EXPEDIENTES}
           SELECT tipo, estado, count(*)::int AS total
           FROM expedientes
           GROUP BY tipo, estado
           ORDER BY tipo, estado`,
          parametros,
        );
        const pagina = await db.query<Fila>(
          `${EXPEDIENTES}
           SELECT tipo, id, codigo, estado, dia::text AS fecha_dia,
                  fecha_hecho, fecha_registro
           FROM expedientes
           WHERE ($6::text IS NULL OR tipo = $6::text)
             AND ($7::text IS NULL OR estado = $7::text)
           ORDER BY fecha_hecho DESC, fecha_registro DESC, codigo DESC
           LIMIT ${POR_PAGINA_EXPEDIENTES} OFFSET $8`,
          [
            ...parametros,
            filtro.tipo,
            filtro.estado,
            (filtro.pagina - 1) * POR_PAGINA_EXPEDIENTES,
          ],
        );
        return {
          resultados: await completar(db, pagina.rows),
          total: conteo.rows
            .filter(
              (f) =>
                (!filtro.tipo || f.tipo === filtro.tipo) &&
                (!filtro.estado || f.estado === filtro.estado),
            )
            .reduce((suma, f) => suma + f.total, 0),
          conteo: conteo.rows,
          pagina: filtro.pagina,
          por_pagina: POR_PAGINA_EXPEDIENTES,
        };
      },
    );
  }
}

function parametrosDe(filtro: FiltroExpedientes) {
  return [
    filtro.codigo === null ? null : comoPatron(filtro.codigo),
    filtro.estudiante === null ? null : comoPatron(filtro.estudiante),
    filtro.estudiante === null ? '' : normalizarParcial(filtro.estudiante),
    filtro.desde,
    filtro.hasta,
  ];
}

// Los datos que se muestran de cada expediente de la página, en el mismo
// orden que la lista.
async function completar(
  db: PoolClient,
  filas: Fila[],
): Promise<ExpedienteEncontrado[]> {
  const idsDe = (tipo: TipoRegistro) =>
    filas.filter((f) => f.tipo === tipo).map((f) => f.id);
  const situaciones = await detalleSituaciones(db, idsDe('SITUACION'));
  const casos = await detalleCasos(db, idsDe('CASO'));
  return filas.flatMap((fila): ExpedienteEncontrado[] => {
    if (fila.tipo === 'SITUACION') {
      const detalle = situaciones.get(fila.id);
      return detalle ? [{ ...fila, ...detalle, tipo: 'SITUACION' }] : [];
    }
    const detalle = casos.get(fila.id);
    return detalle ? [{ ...fila, ...detalle, tipo: 'CASO' }] : [];
  });
}

type DetalleSituacion = Omit<SituacionEncontrada, keyof Fila | 'tipo'>;
type DetalleCaso = Omit<CasoEncontrado, keyof Fila | 'tipo'>;

async function detalleSituaciones(db: PoolClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, DetalleSituacion>();
  const resultado = await db.query<
    Omit<DetalleSituacion, 'caso'> & {
      id: string;
      caso_id: string | null;
      caso_codigo: string | null;
    }
  >(
    `SELECT s.id, s.urgencia, cat.nombre AS categoria, s.registro_historico,
            ca.id AS caso_id, ca.codigo AS caso_codigo,
            ${nombresDe(PARTICIPAN_SITUACION)} AS estudiantes,
            ${cursosDe(`
              FROM (${PARTICIPAN_SITUACION}) q
              JOIN convi.matriculas mt ON mt.id = q.matricula_contexto_id
              JOIN convi.cursos cu ON cu.id = mt.curso_id
              JOIN convi.anios_academicos an ON an.id = cu.anio_academico_id`)} AS cursos,
            ${sinCursoEn(PARTICIPAN_SITUACION)} AS curso_sin_registro
     FROM convi.situaciones s
     LEFT JOIN convi.categorias_convivencia cat ON cat.id = s.categoria_id
     LEFT JOIN convi.casos ca ON ca.id = s.caso_id
     WHERE s.id = ANY($1::uuid[])`,
    [ids],
  );
  return new Map(
    resultado.rows.map(({ id, caso_id, caso_codigo, ...detalle }) => [
      id,
      {
        ...detalle,
        caso:
          caso_id && caso_codigo ? { id: caso_id, codigo: caso_codigo } : null,
      },
    ]),
  );
}

// CA3: los cursos del caso salen de convi.vw_cursos_contexto_caso, que reúne
// los de sus participantes, los de sus situaciones vinculadas y el curso
// desde donde se reportó cada una.
async function detalleCasos(db: PoolClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, DetalleCaso>();
  const resultado = await db.query<DetalleCaso & { id: string }>(
    `SELECT c.id, c.titulo, c.registro_historico, c.cerrado_en,
            cat.nombre AS categoria,
            pr.nombres || ' ' || pr.apellidos AS responsable,
            (SELECT count(*) FROM convi.situaciones s
              WHERE s.caso_id = c.id)::int AS situaciones,
            ${nombresDe(PARTICIPAN_CASO)} AS estudiantes,
            ${cursosDe(`
              FROM convi.vw_cursos_contexto_caso v
              JOIN convi.cursos cu ON cu.id = v.curso_id
              JOIN convi.anios_academicos an ON an.id = v.anio_academico_id
              WHERE v.caso_id = c.id`)} AS cursos,
            ${sinCursoEn(PARTICIPAN_CASO)} AS curso_sin_registro
     FROM convi.casos c
     JOIN convi.membresias_establecimiento mr ON mr.id = c.asignado_a_membresia_id
     JOIN convi.personas pr ON pr.id = mr.persona_id
     LEFT JOIN convi.categorias_convivencia cat ON cat.id = c.categoria_principal_id
     WHERE c.id = ANY($1::uuid[])`,
    [ids],
  );
  return new Map(resultado.rows.map(({ id, ...detalle }) => [id, detalle]));
}