import type { SupabaseClient } from '@supabase/supabase-js';
import type { PoolClient, QueryResultRow } from 'pg';
import { ANIOS_EDITABLES, ROLES } from '../academico/curso.js';
import { fechaLegible, normalizarRut } from '../academico/estudiante.js';
import type { TipoImportacion } from './importacion.js';
import type { Problema } from './revision.js';
import type { TratamientoDuplicado } from './valores.js';

// PB-026 (HU-020): guarda en las fichas lo que trae una fila Válida o Con
// advertencia. Cada tipo busca de nuevo lo que ya existe (CA3: el estudiante
// por su código o su RUT, nunca por el nombre) y vuelve a comprobar el curso y
// el año justo antes de guardar (CA4). Devuelve qué creó o reutilizó (CA1),
// para que una fila Confirmada no se vuelva a procesar (CA2).

export type Accion = 'CREADO' | 'REUTILIZADO';
export type Entidades = Record<string, { id: string; accion: Accion }>;

/** La fila no se puede confirmar; el mensaje es para el administrador. */
export class FilaNoConfirmada extends Error {
  constructor(
    readonly campo: string | null,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Se alcanzó el límite de correos: las filas que faltan quedan para otro intento. */
export class LimiteDeCorreos extends Error {}

export type Confirmacion = {
  db: PoolClient;
  supabase: SupabaseClient;
  anioId: string | null;
  duplicados: TratamientoDuplicado;
  /** El año y los cursos ya leídos (y bloqueados) en esta transacción. */
  memoria: Map<string, Promise<unknown>>;
};

type Datos = Record<string, string | boolean | null>;

/** El registro que identifica a cada fila confirmada (entidad_confirmada_id). */
export const PRINCIPAL: Record<TipoImportacion, string> = {
  ESTUDIANTES: 'estudiante',
  CURSOS: 'curso',
  PROFESORES: 'cuenta',
  APODERADOS: 'vinculo',
  MATRICULAS: 'matricula',
  ASIGNACIONES: 'asignacion',
};

// Mismo mensaje que la invitación de PB-010.
const CORREO_CON_IDENTIDAD =
  'Ese correo ya tiene una identidad en CONVI. Cada cuenta necesita su propio correo.';

function valor(datos: Datos, campo: string) {
  const dato = datos[campo];
  return typeof dato === 'string' && dato !== '' ? dato : null;
}

async function una<T extends QueryResultRow>(
  db: PoolClient,
  sql: string,
  valores: unknown[],
): Promise<T | undefined> {
  return (await db.query<T>(sql, valores)).rows[0];
}

/**
 * Lee una sola vez por transacción: el FOR SHARE de la primera lectura dura
 * hasta el final, así que las filas siguientes ven lo mismo.
 */
function recordar<T>(c: Confirmacion, clave: string, leer: () => Promise<T>) {
  if (!c.memoria.has(clave)) c.memoria.set(clave, leer());
  return c.memoria.get(clave) as Promise<T>;
}

/** Lo que ya existe se usa sin cambios, salvo que se haya elegido marcarlo como error. */
function reutilizar(c: Confirmacion, campo: string, mensaje: string) {
  if (c.duplicados === 'ERROR') throw new FilaNoConfirmada(campo, mensaje);
}

/**
 * El error de una fila, para guardarlo junto a ella. Devuelve null si no es
 * un error esperado de la fila ni de la base: ese se lanza de nuevo.
 */
export function problemaDeError(error: unknown): Problema | null {
  if (error instanceof FilaNoConfirmada)
    return { campo: error.campo, nivel: 'ERROR', mensaje: error.message };
  if (typeof error !== 'object' || error === null || !('severity' in error))
    return null;
  const { code, message } = error as { code?: string; message?: string };
  const mensaje =
    code === '23505'
      ? 'Otro registro con estos datos ya existe en CONVI. Vuelve a revisar las filas.'
      : code === '40001'
        ? 'Los datos cambiaron mientras se confirmaba. Vuelve a confirmar.'
        : code === 'P0001' && message
          ? `CONVI no permitió guardarla: ${message}.`
          : 'No se pudo guardar esta fila.';
  return { campo: null, nivel: 'ERROR', mensaje };
}

async function crearPersona(c: Confirmacion, d: Datos) {
  const persona = await una<{ id: string }>(
    c.db,
    `INSERT INTO convi.personas
       (establecimiento_id, nombres, apellidos, rut, correo, telefono, direccion)
     VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      valor(d, 'nombres'),
      valor(d, 'apellidos'),
      valor(d, 'rut'),
      valor(d, 'correo'),
      valor(d, 'telefono'),
      valor(d, 'direccion'),
    ],
  );
  return (persona as { id: string }).id;
}

/** El año elegido al revisar; FOR SHARE impide que se cierre mientras se confirma. */
function anioElegido(c: Confirmacion) {
  return recordar(c, 'anio', () => leerAnio(c));
}

async function leerAnio(c: Confirmacion) {
  const anio = c.anioId
    ? await una<{
        anio: number;
        estado: string;
        fecha_inicio: string | null;
        fecha_fin: string | null;
      }>(
        c.db,
        `SELECT anio, estado, fecha_inicio::text AS fecha_inicio,
                fecha_fin::text AS fecha_fin
         FROM convi.anios_academicos WHERE id = $1 FOR SHARE`,
        [c.anioId],
      )
    : undefined;
  if (!anio)
    throw new FilaNoConfirmada(
      null,
      'Elige de nuevo el año académico y vuelve a revisar las filas.',
    );
  if (!ANIOS_EDITABLES.includes(anio.estado))
    throw new FilaNoConfirmada(
      null,
      `El año ${anio.anio} está cerrado: ya no recibe datos.`,
    );
  return anio;
}

function buscarCurso(c: Confirmacion, codigo: string | null) {
  return recordar(c, `curso:${codigo ?? ''}`, () => leerCurso(c, codigo));
}

async function leerCurso(c: Confirmacion, codigo: string | null) {
  const anio = await anioElegido(c);
  const curso = codigo
    ? await una<{ id: string; nombre: string; estado: string }>(
        c.db,
        `SELECT id, nombre, estado FROM convi.cursos
         WHERE anio_academico_id = $1 AND codigo = $2
         FOR SHARE`,
        [c.anioId, codigo],
      )
    : undefined;
  if (!curso)
    throw new FilaNoConfirmada(
      'curso',
      `No hay un curso con código ${codigo ?? ''} en ${anio.anio}.`,
    );
  if (['CERRADO', 'ARCHIVADO'].includes(curso.estado))
    throw new FilaNoConfirmada(
      'curso',
      `El curso ${curso.nombre} está cerrado.`,
    );
  return { ...curso, anio };
}

/** El estudiante tiene que estar en CONVI: por su código o por su RUT. */
async function buscarEstudiante(c: Confirmacion, referencia: string | null) {
  const rut = referencia ? normalizarRut(referencia) : null;
  const estudiante = referencia
    ? await una<{ id: string; nombre: string }>(
        c.db,
        `SELECT e.id, p.nombres || ' ' || p.apellidos AS nombre
         FROM convi.estudiantes e
         JOIN convi.personas p ON p.id = e.persona_id
         WHERE e.codigo_estudiante = upper($1)
            OR ($2::text IS NOT NULL AND p.rut = $2)
         LIMIT 1`,
        [referencia, rut],
      )
    : undefined;
  if (!estudiante)
    throw new FilaNoConfirmada(
      'estudiante',
      `No hay un estudiante con el código o RUT ${referencia ?? ''} en CONVI.`,
    );
  return estudiante;
}

/**
 * Matrícula del estudiante en el curso, con las mismas reglas de PB-018. Sin
 * fecha se usa el inicio del año (decisión del PO de PB-020). Un estudiante
 * recién creado en esta misma transacción no tiene otras matrículas.
 */
async function matricular(
  c: Confirmacion,
  estudiante: { id: string; nombre: string; nuevo?: boolean },
  codigoCurso: string | null,
  fecha: string | null,
): Promise<Entidades> {
  const curso = await buscarCurso(c, codigoCurso);
  if (!estudiante.nuevo) {
    // Tocar la ficha: si otra persona lo matricula al mismo tiempo, una de las
    // dos operaciones recibe 40001 en vez de dejar dos matrículas.
    const ficha = await una<{ estado: string }>(
      c.db,
      `UPDATE convi.estudiantes SET estado = estado WHERE id = $1 RETURNING estado`,
      [estudiante.id],
    );
    if (ficha?.estado !== 'ACTIVO')
      throw new FilaNoConfirmada(
        null,
        `La ficha de ${estudiante.nombre} no está activa: no se puede matricular.`,
      );
  }
  const desde = fechaParaMatricula(curso, fecha);

  const entidades: Entidades = {
    curso: { id: curso.id, accion: 'REUTILIZADO' },
  };
  const cruce = estudiante.nuevo
    ? undefined
    : await una<{
        id: string;
        curso_id: string;
        curso_nombre: string;
        finalizado_en: string | null;
      }>(
        c.db,
        `SELECT m.id, m.curso_id, cu.nombre AS curso_nombre,
                m.finalizado_en::text AS finalizado_en
         FROM convi.matriculas m
         JOIN convi.cursos cu ON cu.id = m.curso_id
         WHERE m.estudiante_id = $1
           AND daterange(m.matriculado_en, m.finalizado_en, '[]')
               && daterange($2::date, NULL, '[]')
         ORDER BY m.matriculado_en DESC
         LIMIT 1`,
        [estudiante.id, desde],
      );
  if (cruce) {
    if (cruce.curso_id !== curso.id || cruce.finalizado_en !== null)
      throw new FilaNoConfirmada(
        'curso',
        cruce.finalizado_en
          ? `${estudiante.nombre} tuvo matrícula en ${cruce.curso_nombre} hasta el ${fechaLegible(cruce.finalizado_en)}.`
          : `${estudiante.nombre} ya tiene matrícula en ${cruce.curso_nombre}.`,
      );
    reutilizar(
      c,
      'curso',
      `${estudiante.nombre} ya tiene matrícula en ${curso.nombre}.`,
    );
    entidades.matricula = { id: cruce.id, accion: 'REUTILIZADO' };
    return entidades;
  }
  const nueva = await una<{ id: string }>(
    c.db,
    `INSERT INTO convi.matriculas
       (establecimiento_id, estudiante_id, curso_id, anio_academico_id,
        matriculado_en)
     VALUES (convi.establecimiento_actual(), $1, $2, $3, $4)
     RETURNING id`,
    [estudiante.id, curso.id, c.anioId, desde],
  );
  entidades.matricula = {
    id: (nueva as { id: string }).id,
    accion: 'CREADO',
  };
  return entidades;
}

function fechaParaMatricula(
  curso: Awaited<ReturnType<typeof buscarCurso>>,
  fecha: string | null,
) {
  const { anio } = curso;
  const desde = fecha ?? anio.fecha_inicio;
  if (!desde)
    throw new FilaNoConfirmada(
      'fecha_matricula',
      `Indica la fecha de matrícula: el año ${anio.anio} no tiene fecha de inicio.`,
    );
  if (
    (anio.fecha_inicio && desde < anio.fecha_inicio) ||
    (anio.fecha_fin && desde > anio.fecha_fin)
  )
    throw new FilaNoConfirmada(
      'fecha_matricula',
      `Elige una fecha dentro del año ${anio.anio}.`,
    );

  return desde;
}

// ===== Estudiantes (con su matrícula si trae curso) =====

/** Un fallo del lote se deshace y deja que la ruta por fila identifique el error. */
export async function confirmarEstudiantesEnLote(
  c: Confirmacion,
  filas: Datos[],
): Promise<Entidades[] | null> {
  if (filas.length < 2) return null;
  const datos = filas.map((d, indice) => ({
    indice,
    codigo_estudiante: valor(d, 'codigo_estudiante'),
    rut: valor(d, 'rut'),
    nombres: valor(d, 'nombres'),
    apellidos: valor(d, 'apellidos'),
    correo: valor(d, 'correo'),
    telefono: valor(d, 'telefono'),
    direccion: valor(d, 'direccion'),
    fecha_nacimiento: valor(d, 'fecha_nacimiento'),
    curso: valor(d, 'curso'),
    fecha_matricula: valor(d, 'fecha_matricula'),
    curso_id: null as string | null,
  }));
  const codigos = datos.map((d) => d.codigo_estudiante);
  const ruts = datos.flatMap((d) => (d.rut ? [d.rut] : []));
  // Las repeticiones deben ver lo creado por la fila anterior, en su orden.
  if (
    codigos.includes(null) ||
    new Set(codigos).size !== codigos.length ||
    new Set(ruts).size !== ruts.length
  )
    return null;

  await c.db.query('SAVEPOINT lote_estudiantes');
  try {
    const encontrados = await c.db.query<{
      indice: number;
      id: string | null;
      persona_id: string | null;
    }>(
      `WITH entrada AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb)
         AS r(indice int, codigo_estudiante text, rut text)
     ), por_codigo AS (
       SELECT r.indice, e.id, e.persona_id
       FROM entrada r JOIN convi.estudiantes e
         ON e.codigo_estudiante = r.codigo_estudiante
       JOIN convi.personas p ON p.id = e.persona_id
     ), por_rut AS (
       SELECT r.indice, e.id, e.persona_id
       FROM entrada r JOIN convi.personas p ON p.rut = r.rut
       JOIN convi.estudiantes e ON e.persona_id = p.id
       WHERE r.rut IS NOT NULL
     )
     SELECT r.indice, coalesce(c.id, u.id) AS id,
            coalesce(c.persona_id, u.persona_id) AS persona_id
     FROM entrada r LEFT JOIN por_codigo c ON c.indice = r.indice
     LEFT JOIN por_rut u ON u.indice = r.indice`,
      [JSON.stringify(datos)],
    );
    if (
      encontrados.rows.some(
        (e) => e.id && (c.duplicados === 'ERROR' || datos[e.indice].curso),
      )
    ) {
      await c.db.query('RELEASE SAVEPOINT lote_estudiantes');
      return null;
    }
    const existentes = new Map(encontrados.rows.map((e) => [e.indice, e]));
    const nuevos = datos.filter((d) => !existentes.get(d.indice)?.id);
    for (const d of nuevos) {
      if (!d.curso) continue;
      const curso = await buscarCurso(c, d.curso);
      d.curso_id = curso.id;
      d.fecha_matricula = fechaParaMatricula(curso, d.fecha_matricula);
    }
    const entidades = new Map<number, Entidades>();
    for (const e of encontrados.rows) {
      if (e.id && e.persona_id)
        entidades.set(e.indice, {
          persona: { id: e.persona_id, accion: 'REUTILIZADO' },
          estudiante: { id: e.id, accion: 'REUTILIZADO' },
        });
    }
    if (nuevos.length) {
      const creados = await c.db.query<{
        indice: number;
        id: string;
        persona_id: string;
        curso_id: string | null;
        matricula_id: string | null;
      }>(
        `WITH entrada AS MATERIALIZED (
           SELECT r.*, gen_random_uuid() AS persona_id
           FROM jsonb_to_recordset($1::jsonb) AS r(
             indice int, codigo_estudiante text, nombres text, apellidos text,
             rut text, correo text, telefono text, direccion text,
             fecha_nacimiento date, curso_id uuid, fecha_matricula date)
         ), personas AS (
           INSERT INTO convi.personas
             (id, establecimiento_id, nombres, apellidos, rut, correo, telefono, direccion)
           SELECT persona_id, convi.establecimiento_actual(), nombres, apellidos,
                  rut, correo, telefono, direccion FROM entrada
           RETURNING id
         ), estudiantes AS (
           INSERT INTO convi.estudiantes
             (establecimiento_id, persona_id, codigo_estudiante, fecha_nacimiento)
           SELECT convi.establecimiento_actual(), r.persona_id,
                  r.codigo_estudiante, r.fecha_nacimiento
           FROM entrada r JOIN personas p ON p.id = r.persona_id
           RETURNING id, persona_id
         ), matriculas AS (
           INSERT INTO convi.matriculas
             (establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en)
           SELECT convi.establecimiento_actual(), e.id, r.curso_id, $2::uuid,
                  r.fecha_matricula
           FROM estudiantes e JOIN entrada r ON r.persona_id = e.persona_id
           WHERE r.curso_id IS NOT NULL
           RETURNING id, estudiante_id
         )
         SELECT r.indice, e.id, e.persona_id, r.curso_id, m.id AS matricula_id
         FROM estudiantes e JOIN entrada r ON r.persona_id = e.persona_id
         LEFT JOIN matriculas m ON m.estudiante_id = e.id`,
        [JSON.stringify(nuevos), c.anioId],
      );
      if (creados.rows.length !== nuevos.length)
        throw new Error('El lote no devolvió todas sus fichas.');
      for (const e of creados.rows) {
        if (e.curso_id && !e.matricula_id)
          throw new Error('El lote no devolvió todas sus matrículas.');
        entidades.set(e.indice, {
          persona: { id: e.persona_id, accion: 'CREADO' },
          estudiante: { id: e.id, accion: 'CREADO' },
          ...(e.curso_id && e.matricula_id
            ? {
                curso: { id: e.curso_id, accion: 'REUTILIZADO' as const },
                matricula: { id: e.matricula_id, accion: 'CREADO' as const },
              }
            : {}),
        });
      }
    }
    await c.db.query('RELEASE SAVEPOINT lote_estudiantes');
    return datos.map((d) => entidades.get(d.indice)!);
  } catch (error) {
    await c.db.query(
      'ROLLBACK TO SAVEPOINT lote_estudiantes; RELEASE SAVEPOINT lote_estudiantes',
    );
    c.memoria.clear();
    if (!problemaDeError(error)) throw error;
    return null;
  }
}

async function confirmarEstudiante(c: Confirmacion, d: Datos) {
  const codigo = valor(d, 'codigo_estudiante');
  const rut = valor(d, 'rut');
  const existente = await una<{
    id: string;
    persona_id: string;
    nombre: string;
  }>(
    c.db,
    `SELECT e.id, e.persona_id, p.nombres || ' ' || p.apellidos AS nombre
     FROM convi.estudiantes e
     JOIN convi.personas p ON p.id = e.persona_id
     WHERE e.codigo_estudiante = $1 OR ($2::text IS NOT NULL AND p.rut = $2)
     ORDER BY e.codigo_estudiante = $1 DESC
     LIMIT 1`,
    [codigo, rut],
  );
  let entidades: Entidades;
  let estudiante: { id: string; nombre: string; nuevo?: boolean };
  if (existente) {
    reutilizar(
      c,
      'codigo_estudiante',
      `Ya existe el estudiante ${existente.nombre}.`,
    );
    entidades = {
      persona: { id: existente.persona_id, accion: 'REUTILIZADO' },
      estudiante: { id: existente.id, accion: 'REUTILIZADO' },
    };
    estudiante = existente;
  } else {
    // RETURNING enlaza ambas altas en una sentencia; conserva RLS y disparadores.
    const nuevo = await una<{ id: string; persona_id: string }>(
      c.db,
      `WITH persona AS (
         INSERT INTO convi.personas
           (establecimiento_id, nombres, apellidos, rut, correo, telefono, direccion)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5, $6)
         RETURNING id
       )
       INSERT INTO convi.estudiantes
         (establecimiento_id, persona_id, codigo_estudiante, fecha_nacimiento)
       SELECT convi.establecimiento_actual(), persona.id, $7, $8 FROM persona
       RETURNING id, persona_id`,
      [
        valor(d, 'nombres'),
        valor(d, 'apellidos'),
        valor(d, 'rut'),
        valor(d, 'correo'),
        valor(d, 'telefono'),
        valor(d, 'direccion'),
        codigo,
        valor(d, 'fecha_nacimiento'),
      ],
    );
    const { id, persona_id: persona } = nuevo as {
      id: string;
      persona_id: string;
    };
    entidades = {
      persona: { id: persona, accion: 'CREADO' },
      estudiante: { id, accion: 'CREADO' },
    };
    estudiante = {
      id,
      nombre: `${valor(d, 'nombres')} ${valor(d, 'apellidos')}`,
      nuevo: true,
    };
  }
  // Decisión del PO de PB-020: si trae curso, también se matricula.
  if (valor(d, 'curso'))
    Object.assign(
      entidades,
      await matricular(
        c,
        estudiante,
        valor(d, 'curso'),
        valor(d, 'fecha_matricula'),
      ),
    );
  return entidades;
}

// ===== Cursos =====

async function confirmarCurso(c: Confirmacion, d: Datos): Promise<Entidades> {
  const anio = await anioElegido(c);
  const codigo = valor(d, 'codigo');
  const existente = await una<{ id: string; nombre: string }>(
    c.db,
    `SELECT id, nombre FROM convi.cursos
     WHERE anio_academico_id = $1 AND codigo = $2`,
    [c.anioId, codigo],
  );
  if (existente) {
    reutilizar(
      c,
      'codigo',
      `Ya existe el curso ${codigo ?? ''} (${existente.nombre}) en ${anio.anio}.`,
    );
    return { curso: { id: existente.id, accion: 'REUTILIZADO' } };
  }
  const nivel = await una<{ id: string; activo: boolean }>(
    c.db,
    `SELECT id, activo FROM convi.niveles_educativos WHERE codigo = $1`,
    [valor(d, 'nivel')],
  );
  if (!nivel)
    throw new FilaNoConfirmada(
      'nivel',
      `No hay un nivel con código ${valor(d, 'nivel') ?? ''} en CONVI.`,
    );
  if (!nivel.activo)
    throw new FilaNoConfirmada('nivel', 'Ese nivel está desactivado.');
  const nuevo = await una<{ id: string }>(
    c.db,
    `INSERT INTO convi.cursos
       (establecimiento_id, anio_academico_id, nivel_id, codigo, nombre, seccion)
     VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5)
     RETURNING id`,
    [c.anioId, nivel.id, codigo, valor(d, 'nombre'), valor(d, 'seccion')],
  );
  return { curso: { id: (nuevo as { id: string }).id, accion: 'CREADO' } };
}

// ===== Matrículas de estudiantes que ya están en CONVI =====

async function confirmarMatricula(
  c: Confirmacion,
  d: Datos,
): Promise<Entidades> {
  const estudiante = await buscarEstudiante(c, valor(d, 'estudiante'));
  return {
    estudiante: { id: estudiante.id, accion: 'REUTILIZADO' },
    ...(await matricular(
      c,
      estudiante,
      valor(d, 'curso'),
      valor(d, 'fecha_matricula'),
    )),
  };
}

// ===== Apoderados: la persona y su vínculo con el estudiante =====

async function confirmarApoderado(
  c: Confirmacion,
  d: Datos,
): Promise<Entidades> {
  const estudiante = await buscarEstudiante(c, valor(d, 'estudiante'));
  const rut = valor(d, 'rut');
  const correo = valor(d, 'correo');
  // Por su RUT o, si no trae, por su correo; nunca solo por el nombre.
  const persona = rut
    ? await una<{ id: string; es_estudiante: boolean }>(
        c.db,
        `SELECT p.id, EXISTS (SELECT 1 FROM convi.estudiantes e
                              WHERE e.persona_id = p.id) AS es_estudiante
         FROM convi.personas p WHERE p.rut = $1`,
        [rut],
      )
    : correo
      ? await una<{ id: string; es_estudiante: boolean }>(
          c.db,
          `SELECT p.id, false AS es_estudiante FROM convi.personas p
           WHERE lower(p.correo) = $1
             AND NOT EXISTS (SELECT 1 FROM convi.estudiantes e
                             WHERE e.persona_id = p.id)
           ORDER BY p.creado_en
           LIMIT 1`,
          [correo],
        )
      : undefined;
  if (persona?.es_estudiante)
    throw new FilaNoConfirmada('rut', 'Ese RUT es de un estudiante.');

  const entidades: Entidades = {
    estudiante: { id: estudiante.id, accion: 'REUTILIZADO' },
    persona: persona
      ? { id: persona.id, accion: 'REUTILIZADO' }
      : { id: await crearPersona(c, d), accion: 'CREADO' },
  };
  const vinculo = await una<{ id: string }>(
    c.db,
    `SELECT id FROM convi.apoderados_estudiante
     WHERE estudiante_id = $1 AND persona_apoderado_id = $2`,
    [estudiante.id, entidades.persona.id],
  );
  if (vinculo) {
    reutilizar(
      c,
      'estudiante',
      `Esa persona ya figura como apoderado de ${estudiante.nombre}.`,
    );
    entidades.vinculo = { id: vinculo.id, accion: 'REUTILIZADO' };
    return entidades;
  }
  const nuevo = await una<{ id: string }>(
    c.db,
    `INSERT INTO convi.apoderados_estudiante
       (establecimiento_id, estudiante_id, persona_apoderado_id, tipo_relacion,
        es_principal, puede_ser_contactado)
     VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5)
     RETURNING id`,
    [
      estudiante.id,
      entidades.persona.id,
      valor(d, 'parentesco'),
      d.principal === true,
      d.contactable !== false,
    ],
  );
  entidades.vinculo = { id: (nuevo as { id: string }).id, accion: 'CREADO' };
  return entidades;
}

// ===== Asignaciones de profesores =====

async function confirmarAsignacion(
  c: Confirmacion,
  d: Datos,
): Promise<Entidades> {
  const referencia = valor(d, 'profesor');
  const rut =
    referencia && !referencia.includes('@') ? normalizarRut(referencia) : null;
  const cuenta = referencia
    ? await una<{ id: string; estado: string; nombre: string }>(
        c.db,
        `SELECT m.id, m.estado, p.nombres || ' ' || p.apellidos AS nombre
         FROM convi.membresias_establecimiento m
         JOIN convi.personas p ON p.id = m.persona_id
         WHERE m.codigo_perfil = 'PROFESOR'
           AND (lower(m.correo_invitacion) = lower($1)
                OR ($2::text IS NOT NULL AND p.rut = $2))
         LIMIT 1`,
        [referencia, rut],
      )
    : undefined;
  if (!cuenta)
    throw new FilaNoConfirmada(
      'profesor',
      `No hay un profesor con el correo o RUT ${referencia ?? ''} en CONVI.`,
    );
  // Decisión del PO de PB-015: profesores activos o pendientes.
  if (!['ACTIVO', 'PENDIENTE'].includes(cuenta.estado))
    throw new FilaNoConfirmada(
      'profesor',
      `La cuenta de ${cuenta.nombre} no está activa ni pendiente.`,
    );
  const curso = await buscarCurso(c, valor(d, 'curso'));
  const rol = valor(d, 'rol');
  if (!rol || !(ROLES as readonly string[]).includes(rol))
    throw new FilaNoConfirmada('rol', 'Escribe Profesor jefe o Profesor.');
  const inicio = valor(d, 'fecha_inicio') ?? curso.anio.fecha_inicio;
  if (!inicio)
    throw new FilaNoConfirmada(
      'fecha_inicio',
      `Indica la fecha de inicio: el año ${curso.anio.anio} no tiene fecha de inicio.`,
    );
  const fin = valor(d, 'fecha_fin');

  // Tocar el curso ordena dos asignaciones al mismo curso que llegan a la vez
  // (como asignaciones.service.ts): la segunda recibe 40001.
  await c.db.query(`UPDATE convi.cursos SET estado = estado WHERE id = $1`, [
    curso.id,
  ]);
  const entidades: Entidades = {
    cuenta: { id: cuenta.id, accion: 'REUTILIZADO' },
    curso: { id: curso.id, accion: 'REUTILIZADO' },
  };
  const cruce = `daterange(a.fecha_inicio, a.fecha_fin, '[]')
                 && daterange($2::date, $3::date, '[]')`;
  const repetida = await una<{ id: string }>(
    c.db,
    `SELECT a.id FROM convi.asignaciones_docentes a
     WHERE a.curso_id = $1 AND ${cruce}
       AND a.membresia_id = $4 AND a.rol_asignacion = $5
     LIMIT 1`,
    [curso.id, inicio, fin, cuenta.id, rol],
  );
  if (repetida) {
    reutilizar(
      c,
      'profesor',
      `${cuenta.nombre} ya tiene ese rol en ${curso.nombre} en esas fechas.`,
    );
    entidades.asignacion = { id: repetida.id, accion: 'REUTILIZADO' };
    return entidades;
  }
  // Decisión del PO de PB-015: un solo profesor jefe a la vez por curso.
  if (rol === 'PROFESOR_JEFE') {
    const jefe = await una<{ nombre: string }>(
      c.db,
      `SELECT p.nombres || ' ' || p.apellidos AS nombre
       FROM convi.asignaciones_docentes a
       JOIN convi.membresias_establecimiento m ON m.id = a.membresia_id
       JOIN convi.personas p ON p.id = m.persona_id
       WHERE a.curso_id = $1 AND a.rol_asignacion = 'PROFESOR_JEFE'
         AND ${cruce}
       LIMIT 1`,
      [curso.id, inicio, fin],
    );
    if (jefe)
      throw new FilaNoConfirmada(
        'rol',
        `${curso.nombre} ya tiene profesor jefe en esas fechas (${jefe.nombre}).`,
      );
  }
  const nueva = await una<{ id: string }>(
    c.db,
    `INSERT INTO convi.asignaciones_docentes
       (establecimiento_id, curso_id, membresia_id, rol_asignacion,
        fecha_inicio, fecha_fin)
     VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5)
     RETURNING id`,
    [curso.id, cuenta.id, rol, inicio, fin],
  );
  entidades.asignacion = { id: (nueva as { id: string }).id, accion: 'CREADO' };
  return entidades;
}

// ===== Profesores: la cuenta Pendiente y su invitación =====

async function confirmarProfesor(
  c: Confirmacion,
  d: Datos,
): Promise<Entidades> {
  const correo = valor(d, 'correo')?.toLowerCase() ?? null;
  const rut = valor(d, 'rut');
  if (!correo)
    throw new FilaNoConfirmada('correo', 'Falta el correo de la invitación.');
  // PB-010 CA2: un correo no se invita dos veces en la misma escuela.
  const cuenta = await una<{ id: string; perfil: string; nombre: string }>(
    c.db,
    `SELECT m.id, m.codigo_perfil AS perfil,
            p.nombres || ' ' || p.apellidos AS nombre
     FROM convi.membresias_establecimiento m
     JOIN convi.personas p ON p.id = m.persona_id
     WHERE lower(m.correo_invitacion) = $1`,
    [correo],
  );
  if (cuenta) {
    if (cuenta.perfil !== 'PROFESOR')
      throw new FilaNoConfirmada(
        'correo',
        'Ese correo ya tiene una cuenta de otro perfil en la escuela.',
      );
    reutilizar(
      c,
      'correo',
      `${cuenta.nombre} ya tiene cuenta de Profesor en la escuela.`,
    );
    return { cuenta: { id: cuenta.id, accion: 'REUTILIZADO' } };
  }

  // La ficha de la persona: por su RUT o, como en PB-010, por su correo si no
  // tiene cuenta ni es estudiante.
  const conRut = rut
    ? await una<{ id: string; es_estudiante: boolean; con_cuenta: boolean }>(
        c.db,
        `SELECT p.id,
                EXISTS (SELECT 1 FROM convi.estudiantes e
                        WHERE e.persona_id = p.id) AS es_estudiante,
                EXISTS (SELECT 1 FROM convi.membresias_establecimiento m
                        WHERE m.persona_id = p.id) AS con_cuenta
         FROM convi.personas p WHERE p.rut = $1`,
        [rut],
      )
    : undefined;
  if (conRut?.es_estudiante)
    throw new FilaNoConfirmada('rut', 'Ese RUT es de un estudiante.');
  if (conRut?.con_cuenta)
    throw new FilaNoConfirmada(
      'rut',
      'Ese RUT es de una persona que ya tiene otra cuenta en la escuela.',
    );
  const conCorreo = conRut
    ? undefined
    : await una<{ id: string }>(
        c.db,
        `SELECT p.id FROM convi.personas p
         WHERE lower(p.correo) = $1
           AND NOT EXISTS (SELECT 1 FROM convi.membresias_establecimiento m
                           WHERE m.persona_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM convi.estudiantes e
                           WHERE e.persona_id = p.id)
         ORDER BY p.creado_en
         LIMIT 1`,
        [correo],
      );
  const existente = conRut ?? conCorreo;
  const entidades: Entidades = {
    persona: existente
      ? { id: existente.id, accion: 'REUTILIZADO' }
      : { id: await crearPersona(c, d), accion: 'CREADO' },
  };
  // Quién invitó sale de la sesión (validar_membresia exige un administrador activo).
  const nueva = await una<{ id: string }>(
    c.db,
    `INSERT INTO convi.membresias_establecimiento
       (establecimiento_id, persona_id, codigo_perfil, estado, invitado_por,
        invitado_en, correo_invitacion)
     VALUES (convi.establecimiento_actual(), $1, 'PROFESOR', 'PENDIENTE',
             convi.membresia_actual(), now(), $2)
     RETURNING id`,
    [entidades.persona.id, correo],
  );
  const id = (nueva as { id: string }).id;

  // PB-138: no queda una cuenta Pendiente sin su invitación. Si el correo
  // falla, la fila se deshace y queda para otro intento. La plantilla arma el
  // enlace con membresia_id, igual que en PB-010.
  const { error } = await c.supabase.auth.admin.inviteUserByEmail(correo, {
    data: { membresia_id: id },
  });
  if (error) {
    if (error.status === 429 || error.code === 'over_email_send_rate_limit')
      throw new LimiteDeCorreos();
    if (error.code === 'email_exists' || error.status === 422)
      throw new FilaNoConfirmada('correo', CORREO_CON_IDENTIDAD);
    throw new FilaNoConfirmada(
      'correo',
      'No se pudo enviar la invitación. Vuelve a confirmar en unos minutos.',
    );
  }
  entidades.cuenta = { id, accion: 'CREADO' };
  return entidades;
}

export const CONFIRMAR: Record<
  TipoImportacion,
  (c: Confirmacion, datos: Datos) => Promise<Entidades>
> = {
  ESTUDIANTES: confirmarEstudiante,
  CURSOS: confirmarCurso,
  PROFESORES: confirmarProfesor,
  APODERADOS: confirmarApoderado,
  MATRICULAS: confirmarMatricula,
  ASIGNACIONES: confirmarAsignacion,
};
