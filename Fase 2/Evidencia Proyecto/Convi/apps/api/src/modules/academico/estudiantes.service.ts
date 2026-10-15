import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { errorDeCampos } from './curso.js';
import {
  type DatosEstudiante,
  normalizarRut,
  validarEstudiante,
  validarFiltro,
} from './estudiante.js';
import {
  COLUMNAS_MATRICULA,
  DESDE_MATRICULAS,
  type Matricula,
} from './matriculas.service.js';

// PB-017 (HU-014): nómina y ficha de los estudiantes de la escuela del
// administrador. Los datos personales están en convi.personas y los del
// estudiante en convi.estudiantes. CA4: la ficha no lee situaciones, casos,
// expedientes ni adjuntos.
const PERFILES: Perfil[] = ['ADMIN'];
const POR_PAGINA = 50;
const MENSAJE_FICHA = 'Revisa los datos marcados. No se guardó la ficha.';

export type Estudiante = {
  id: string;
  codigo_estudiante: string;
  nombres: string;
  apellidos: string;
  rut: string | null;
  /** ACTIVO, INACTIVO o EGRESADO. */
  estado: string;
  /** Curso de la matrícula activa, si tiene. */
  curso_id: string | null;
  curso_nombre: string | null;
  anio: number | null;
};

export type Nomina = {
  estudiantes: Estudiante[];
  total: number;
  pagina: number;
  por_pagina: number;
};

export type FichaEstudiante = {
  id: string;
  codigo_estudiante: string;
  nombres: string;
  apellidos: string;
  rut: string | null;
  /** AAAA-MM-DD. */
  fecha_nacimiento: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  estado: string;
  /** Todas sus matrículas, la más reciente primero. */
  matriculas: Matricula[];
};

type ErrorPostgres = { code?: string; constraint?: string };

// Un estudiante tiene a lo más una matrícula activa: la base no deja dos con
// períodos superpuestos y una activa no tiene fecha de término.
const DESDE_NOMINA = `
  FROM convi.estudiantes e
  JOIN convi.personas p ON p.id = e.persona_id
  LEFT JOIN LATERAL (
    SELECT m.curso_id, c.nombre AS curso_nombre, an.anio
    FROM convi.matriculas m
    JOIN convi.cursos c ON c.id = m.curso_id
    JOIN convi.anios_academicos an ON an.id = m.anio_academico_id
    WHERE m.estudiante_id = e.id AND m.estado = 'ACTIVO'
    ORDER BY m.matriculado_en DESC
    LIMIT 1
  ) actual ON true`;

// El nombre se busca sin tildes ni diéresis, para que "perez" encuentre a
// "Pérez"; la ñ se mantiene.
const sinTildes = (sql: string) =>
  `translate(${sql}, 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')`;

// $1 texto con comodines, $2 RUT sin guion con comodín ('' si no parece RUT)
// y $3 el curso (o null).
const FILTRO_NOMINA = `
  WHERE ($1 = '%%'
         OR ${sinTildes(`p.nombres || ' ' || p.apellidos`)} ILIKE ${sinTildes('$1')}
         OR ${sinTildes(`p.apellidos || ' ' || p.nombres`)} ILIKE ${sinTildes('$1')}
         OR e.codigo_estudiante ILIKE $1
         OR ($2 <> '' AND replace(p.rut, '-', '') LIKE $2))
    AND ($3::uuid IS NULL OR actual.curso_id = $3::uuid)`;

const COLUMNAS_FICHA = `
  e.id, e.codigo_estudiante, p.nombres, p.apellidos, p.rut,
  e.fecha_nacimiento::text AS fecha_nacimiento,
  p.correo, p.telefono, p.direccion, e.estado`;

@Injectable()
export class EstudiantesService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Nómina por apellidos, de a 50, buscando por nombre, código o RUT y, si se
  // pide, solo los matriculados hoy en un curso.
  listar(
    sesion: Sesion,
    buscar: unknown,
    curso: unknown,
    pagina: unknown,
  ): Promise<Nomina> {
    const filtro = validarFiltro(buscar, curso, pagina);
    // Los comodines que escriba la persona se buscan como texto.
    const texto = `%${filtro.buscar.replace(/[\\%_]/g, '\\$&')}%`;
    const rut = normalizarParcial(filtro.buscar);
    return this.operar(sesion, async (db) => {
      const total = await db.query<{ total: number }>(
        `SELECT count(*)::int AS total ${DESDE_NOMINA} ${FILTRO_NOMINA}`,
        [texto, rut, filtro.curso],
      );
      const estudiantes = await db.query<Estudiante>(
        `SELECT e.id, e.codigo_estudiante, p.nombres, p.apellidos, p.rut,
                e.estado, actual.curso_id, actual.curso_nombre, actual.anio
         ${DESDE_NOMINA} ${FILTRO_NOMINA}
         ORDER BY p.apellidos, p.nombres, e.codigo_estudiante
         LIMIT ${POR_PAGINA} OFFSET $4`,
        [texto, rut, filtro.curso, (filtro.pagina - 1) * POR_PAGINA],
      );
      return {
        estudiantes: estudiantes.rows,
        total: total.rows[0].total,
        pagina: filtro.pagina,
        por_pagina: POR_PAGINA,
      };
    });
  }

  // CA4: datos personales, de contacto y matrículas; nada de convivencia.
  obtener(sesion: Sesion, id: string): Promise<FichaEstudiante> {
    return this.operar(sesion, (db) => buscarFicha(db, id));
  }

  // CA1 y CA2: crea la persona y su ficha de estudiante en la misma
  // operación. El estudiante queda Activo.
  crear(sesion: Sesion, cuerpo: unknown): Promise<FichaEstudiante> {
    const datos = validarEstudiante(cuerpo);
    return this.operar(sesion, async (db) => {
      await revisarNacimiento(db, datos);
      const persona = await db.query<{ id: string }>(
        `INSERT INTO convi.personas
           (establecimiento_id, nombres, apellidos, rut, correo, telefono,
            direccion)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          datos.nombres,
          datos.apellidos,
          datos.rut,
          datos.correo,
          datos.telefono,
          datos.direccion,
        ],
      );
      const estudiante = await db.query<{ id: string }>(
        `INSERT INTO convi.estudiantes
           (establecimiento_id, persona_id, codigo_estudiante, fecha_nacimiento)
         VALUES (convi.establecimiento_actual(), $1, $2, $3)
         RETURNING id`,
        [persona.rows[0].id, datos.codigo_estudiante, datos.fecha_nacimiento],
      );
      return buscarFicha(db, estudiante.rows[0].id);
    });
  }

  // Decisión del PO: la ficha se corrige aquí (adelanta HU-016 para el
  // estudiante). Conserva el estudiante y su persona; la base guarda en la
  // auditoría el valor anterior, el nuevo y quién lo cambió. No toca la
  // matrícula ni el estado.
  editar(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<FichaEstudiante> {
    const datos = validarEstudiante(cuerpo);
    return this.operar(sesion, async (db) => {
      const actual = await db.query<{ persona_id: string }>(
        `SELECT persona_id FROM convi.estudiantes WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (actual.rows.length === 0)
        throw new NotFoundException('No encontramos ese estudiante.');
      await revisarNacimiento(db, datos);
      await db.query(
        `UPDATE convi.personas
         SET nombres = $2, apellidos = $3, rut = $4, correo = $5,
             telefono = $6, direccion = $7
         WHERE id = $1`,
        [
          actual.rows[0].persona_id,
          datos.nombres,
          datos.apellidos,
          datos.rut,
          datos.correo,
          datos.telefono,
          datos.direccion,
        ],
      );
      await db.query(
        `UPDATE convi.estudiantes
         SET codigo_estudiante = $2, fecha_nacimiento = $3
         WHERE id = $1`,
        [id, datos.codigo_estudiante, datos.fecha_nacimiento],
      );
      return buscarFicha(db, id);
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

async function buscarFicha(db: PoolClient, id: string) {
  const ficha = await db.query<Omit<FichaEstudiante, 'matriculas'>>(
    `SELECT ${COLUMNAS_FICHA}
     FROM convi.estudiantes e
     JOIN convi.personas p ON p.id = e.persona_id
     WHERE e.id = $1`,
    [id],
  );
  if (ficha.rows.length === 0)
    throw new NotFoundException('No encontramos ese estudiante.');
  const matriculas = await db.query<Matricula>(
    `SELECT ${COLUMNAS_MATRICULA} ${DESDE_MATRICULAS}
     WHERE m.estudiante_id = $1
     ORDER BY m.matriculado_en DESC`,
    [id],
  );
  return { ...ficha.rows[0], matriculas: matriculas.rows };
}

// La fecha de nacimiento no puede ser futura, según el día de hoy en la zona
// horaria de la escuela (la base trabaja en UTC).
async function revisarNacimiento(db: PoolClient, datos: DatosEstudiante) {
  if (!datos.fecha_nacimiento) return;
  const hoy = await db.query<{ hoy: string }>(
    `SELECT (now() AT TIME ZONE zona_horaria)::date::text AS hoy
     FROM convi.establecimientos
     WHERE id = convi.establecimiento_actual()`,
  );
  if (datos.fecha_nacimiento > hoy.rows[0].hoy)
    throw errorDeCampos(
      { fecha_nacimiento: 'La fecha de nacimiento no puede ser futura.' },
      MENSAJE_FICHA,
    );
}

// Si lo buscado parece un RUT (solo números, puntos, guion y K), se compara
// sin puntos ni guion desde el inicio. Con menos de 3 números no se usa.
function normalizarParcial(buscar: string) {
  const limpio = buscar.replace(/[.\s-]/g, '').toUpperCase();
  if (!/^[0-9]{3,}K?$/.test(limpio)) return '';
  const completo = normalizarRut(buscar);
  return `${(completo ?? limpio).replace('-', '')}%`;
}

// Convierte los errores conocidos del modelo en respuestas claras. Los demás
// siguen su curso: CuentaService.operar revierte y responde 503.
function traducirError(error: unknown) {
  const { code, constraint } = (error ?? {}) as ErrorPostgres;
  // CA2: el código y el RUT no se repiten en la escuela.
  if (
    code === '23505' &&
    constraint === 'estudiantes_establecimiento_id_codigo_estudiante_key'
  )
    return errorDeCampos(
      {
        codigo_estudiante:
          'Ese código ya lo tiene otro estudiante de tu escuela.',
      },
      MENSAJE_FICHA,
    );
  // El RUT es único entre todas las personas de la escuela, no solo estudiantes.
  if (code === '23505' && constraint === 'personas_establecimiento_id_rut_idx')
    return errorDeCampos(
      { rut: 'Ese RUT ya está registrado en tu escuela.' },
      MENSAJE_FICHA,
    );
  // Otra persona cambió la ficha mientras se guardaba.
  if (code === '40001')
    return new ConflictException(
      'La ficha cambió mientras guardabas. Recarga la página e inténtalo de nuevo.',
    );
  return error;
}