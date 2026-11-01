import { codigoAutomatico } from './codigo-automatico.js';
import { objeto, texto, fechaValida } from './curso.js';
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
  errorOtraPersona,
  esOtraPersona,
  type IdentidadPersona,
} from './correccion-persona.js';
import { errorDeCampos } from './curso.js';
import {
  type DatosEstudiante,
  normalizarRut,
  validarEstadoNomina,
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
// Materializar las matrículas evita repetir la seguridad por fila al recorrer cada estudiante.
const MATRICULAS_NOMINA = `WITH estudiantes_nomina AS MATERIALIZED (
  SELECT id, persona_id, codigo_estudiante, estado FROM convi.estudiantes
  WHERE establecimiento_id = (SELECT convi.establecimiento_actual())
), personas_nomina AS MATERIALIZED (
  SELECT id, nombres, apellidos, rut FROM convi.personas
  WHERE establecimiento_id = (SELECT convi.establecimiento_actual())
), cursos_nomina AS MATERIALIZED (
  SELECT c.id, c.nombre, an.anio FROM convi.cursos c
  JOIN convi.anios_academicos an ON an.id = c.anio_academico_id
  WHERE c.establecimiento_id = (SELECT convi.establecimiento_actual())
), matriculas_nomina AS MATERIALIZED (
  SELECT m.estudiante_id, c.id AS curso_id, c.nombre AS curso_nombre, c.anio
  FROM convi.matriculas m JOIN cursos_nomina c ON c.id = m.curso_id
  WHERE m.establecimiento_id = (SELECT convi.establecimiento_actual()) AND m.estado = 'ACTIVO'
)`;
const DESDE_NOMINA = `
  FROM estudiantes_nomina e
  JOIN personas_nomina p ON p.id = e.persona_id
  LEFT JOIN matriculas_nomina actual ON actual.estudiante_id = e.id`;

// El nombre se busca sin tildes ni diéresis, para que "perez" encuentre a
// "Pérez"; la ñ se mantiene.
export const sinTildes = (sql: string) =>
  `translate(${sql}, 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')`;

// $1 texto con comodines, $2 RUT sin guion con comodín ('' si no parece RUT),
// $3 el curso (o null) y $4 el estado del estudiante (o TODOS).
const FILTRO_NOMINA = `
  WHERE ($1 = '%%'
         OR ${sinTildes(`p.nombres || ' ' || p.apellidos`)} ILIKE ${sinTildes('$1')}
         OR ${sinTildes(`p.apellidos || ' ' || p.nombres`)} ILIKE ${sinTildes('$1')}
         OR e.codigo_estudiante ILIKE $1
         OR ($2 <> '' AND replace(p.rut, '-', '') LIKE $2))
    AND ($3::uuid IS NULL OR actual.curso_id = $3::uuid)
    AND ($4 = 'TODOS' OR e.estado = $4)`;

const COLUMNAS_FICHA = `
  e.id, e.codigo_estudiante, p.nombres, p.apellidos, p.rut,
  e.fecha_nacimiento::text AS fecha_nacimiento,
  p.correo, p.telefono, p.direccion, e.estado`;

@Injectable()
export class EstudiantesService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  desactivar(sesion: Sesion, cuerpo: unknown) {
    const datos = objeto(cuerpo);
    const filtro = validarFiltro(datos.buscar, datos.curso, '1');
    const motivo = texto(datos.motivo);
    const fecha = texto(datos.fecha);
    if (
      datos.confirmado !== true ||
      !Number.isInteger(datos.total_esperado) ||
      Number(datos.total_esperado) < 1 ||
      Number(datos.total_esperado) > 10000 ||
      motivo.length < 5 ||
      motivo.length > 500 ||
      !fechaValida(fecha)
    )
      throw errorDeCampos(
        {},
        'Confirma la cantidad, una fecha válida y el motivo de la desactivación',
      );
    const busqueda = `%${filtro.buscar.replace(/[\\%_]/g, '\\$&')}%`;
    return this.operar(sesion, async (db) => {
      await db.query('SET LOCAL jit = off');
      // Las políticas subestiman la nómina, evita cruzar miles de matrículas por cada estudiante.
      await db.query('SET LOCAL enable_nestloop = off');
      const hoy = (
        await db.query<{ hoy: string }>(
          `SELECT (now() AT TIME ZONE zona_horaria)::date::text AS hoy FROM convi.establecimientos WHERE id=convi.establecimiento_actual()`,
        )
      ).rows[0].hoy;
      if (fecha > hoy)
        throw errorDeCampos({ fecha: 'La fecha no puede ser futura' });
      const elegidos = await db.query<{ id: string }>(
        ` ${MATRICULAS_NOMINA} SELECT e.id ${DESDE_NOMINA} ${FILTRO_NOMINA} ORDER BY e.id LIMIT 10001`,
        [busqueda, normalizarParcial(filtro.buscar), filtro.curso, 'ACTIVO'],
      );
      if (elegidos.rows.length !== datos.total_esperado)
        throw new ConflictException(
          'La cantidad de estudiantes cambió, vuelve a buscar y confirma la lista actual',
        );
      const ids = elegidos.rows.map((e) => e.id);
      // Bloques acotados, dentro de la misma transacción para conservar todo o nada.
      for (let i = 0; i < ids.length; i += 250)
        await db.query(
          'SELECT id FROM convi.estudiantes WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [ids.slice(i, i + 250)],
        );
      const futuras = await db.query(
        `SELECT 1 FROM convi.matriculas WHERE estudiante_id=ANY($1::uuid[]) AND estado='ACTIVO' AND matriculado_en>$2::date LIMIT 1`,
        [ids, fecha],
      );
      if (futuras.rowCount)
        throw errorDeCampos({
          fecha:
            'Una matrícula comienza después de esa fecha, revisa las fichas antes de continuar',
        });
      await db.query("SELECT set_config('app.motivo_cambio',$1,true)", [
        motivo,
      ]);
      for (let i = 0; i < ids.length; i += 250) {
        const bloque = ids.slice(i, i + 250);
        await db.query(
          `UPDATE convi.matriculas SET estado='RETIRADO',finalizado_en=$2::date WHERE estudiante_id=ANY($1::uuid[]) AND estado='ACTIVO'`,
          [bloque, fecha],
        );
        await db.query(
          `UPDATE convi.estudiantes SET estado='INACTIVO' WHERE id=ANY($1::uuid[])`,
          [bloque],
        );
      }
      return { actualizados: ids.length };
    });
  }

  // Nómina por apellidos, de a 50, buscando por nombre, código o RUT y, si se
  // pide, solo los matriculados hoy en un curso. PB-031 (HU-024 CA2): por
  // defecto solo muestra a los estudiantes Activos.
  listar(
    sesion: Sesion,
    buscar: unknown,
    curso: unknown,
    pagina: unknown,
    estado?: unknown,
  ): Promise<Nomina> {
    const filtro = validarFiltro(buscar, curso, pagina);
    const estadoNomina = validarEstadoNomina(estado);
    // Los comodines que escriba la persona se buscan como texto.
    const texto = `%${filtro.buscar.replace(/[\\%_]/g, '\\$&')}%`;
    const rut = normalizarParcial(filtro.buscar);
    return this.operar(sesion, async (db) => {
      await db.query('SET LOCAL jit = off');
      await db.query('SET LOCAL enable_nestloop = off');
      const total = await db.query<{ total: number }>(
        ` ${MATRICULAS_NOMINA} SELECT count(*)::int AS total ${DESDE_NOMINA} ${FILTRO_NOMINA}`,
        [texto, rut, filtro.curso, estadoNomina],
      );
      const estudiantes = await db.query<Estudiante>(
        ` ${MATRICULAS_NOMINA} SELECT e.id, e.codigo_estudiante, p.nombres, p.apellidos, p.rut,
                e.estado, actual.curso_id, actual.curso_nombre, actual.anio
         ${DESDE_NOMINA} ${FILTRO_NOMINA}
         ORDER BY p.apellidos, p.nombres, e.codigo_estudiante
         LIMIT ${POR_PAGINA} OFFSET $5`,
        [
          texto,
          rut,
          filtro.curso,
          estadoNomina,
          (filtro.pagina - 1) * POR_PAGINA,
        ],
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
    return this.operar(
      sesion,
      async (db) => {
        const entrada = objeto(cuerpo);
        const codigo =
          texto(entrada.codigo_estudiante) ||
          (await codigoAutomatico(db, 'estudiante'));
        const datos = validarEstudiante({
          ...entrada,
          codigo_estudiante: codigo,
        });
        if (!datos.rut)
          throw errorDeCampos({
            rut: 'Ingresa un RUT válido para registrar al estudiante',
          });
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
      },
      'READ COMMITTED',
    );
  }

  // PB-021 (HU-016): la ficha se corrige aquí. Conserva el estudiante y su
  // persona; la base guarda en la auditoría el valor anterior, el nuevo y
  // quién lo cambió (CA1). No toca la matrícula, el estado, los vínculos ni
  // nada de convivencia (CA2 y CA4).
  editar(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<FichaEstudiante> {
    const datos = validarEstudiante(cuerpo);
    return this.operar(sesion, async (db) => {
      const actual = await db.query<IdentidadPersona & { persona_id: string }>(
        `SELECT e.persona_id, p.nombres, p.apellidos, p.rut
         FROM convi.estudiantes e
         JOIN convi.personas p ON p.id = e.persona_id
         WHERE e.id = $1
         FOR UPDATE OF e, p`,
        [id],
      );
      if (actual.rows.length === 0)
        throw new NotFoundException('No encontramos ese estudiante.');
      // CA2: la ficha no se convierte en la de otra persona.
      if (esOtraPersona(actual.rows[0], datos))
        throw errorOtraPersona(
          'Cambiaste nombres y apellidos a la vez: eso sería otro estudiante. Si lo es, crea su propia ficha. No se guardó la ficha.',
        );
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
export function normalizarParcial(buscar: string) {
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
