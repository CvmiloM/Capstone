import type { PoolClient } from 'pg';
import { ANIOS_EDITABLES, type Rol } from '../academico/curso.js';
import { errorDeCampos, type TipoImportacion } from './importacion.js';
import { claveDeNombre } from './valores.js';

// PB-020 (HU-015 CA4): lo que ya existe en la escuela, leído una sola vez para
// revisar todas las filas en memoria (hasta 5.000) sin una consulta por fila.
// RLS deja ver solo los datos de la escuela de la sesión.

export type PersonaExistente = {
  id: string;
  nombre: string;
  rut: string | null;
  correo: string | null;
  estudiante: { id: string; codigo: string; estado: string } | null;
  /** Una persona tiene a lo más una cuenta por escuela. */
  cuenta: { id: string; perfil: string; estado: string; correo: string } | null;
};

export type AnioElegido = {
  id: string;
  anio: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
};

export type CursoExistente = {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
};

export type Contexto = {
  /** Hoy en la zona horaria de la escuela, AAAA-MM-DD. */
  hoy: string;
  anio: AnioElegido | null;
  porRut: Map<string, PersonaExistente>;
  /** Correo de la ficha de la persona. */
  porCorreo: Map<string, PersonaExistente>;
  /** Correo con el que se invitó su cuenta. */
  porCorreoDeCuenta: Map<string, PersonaExistente>;
  porCodigoEstudiante: Map<string, PersonaExistente>;
  porNombre: Map<string, PersonaExistente[]>;
  niveles: Map<string, { activo: boolean }>;
  /** Cursos del año elegido, por código. */
  cursos: Map<string, CursoExistente>;
  /** Matrículas de todos los años, por estudiante. */
  matriculas: Map<
    string,
    {
      curso_id: string;
      curso_nombre: string;
      anio: number;
      desde: string;
      hasta: string | null;
    }[]
  >;
  /** Asignaciones de los cursos del año, por curso. */
  asignaciones: Map<
    string,
    {
      cuenta_id: string;
      rol: Rol;
      desde: string | null;
      hasta: string | null;
      nombre: string;
    }[]
  >;
  /** Apoderados de cada estudiante. */
  vinculos: Map<
    string,
    {
      persona_id: string;
      principal: boolean;
      vigente: boolean;
      nombre: string;
    }[]
  >;
};

const MENSAJE = 'Revisa los datos marcados. No se revisaron las filas.';

function agrupar<T>(filas: T[], clave: (fila: T) => string) {
  const grupos = new Map<string, T[]>();
  for (const fila of filas) {
    const grupo = grupos.get(clave(fila));
    if (grupo) grupo.push(fila);
    else grupos.set(clave(fila), [fila]);
  }
  return grupos;
}

export async function cargarContexto(
  db: PoolClient,
  tipo: TipoImportacion,
  anioId: string | null,
): Promise<Contexto> {
  const hoy = await db.query<{ hoy: string }>(
    `SELECT (now() AT TIME ZONE zona_horaria)::date::text AS hoy
     FROM convi.establecimientos
     WHERE id = convi.establecimiento_actual()`,
  );

  // Decisión del PO de PB-015: se importa solo en años Planificados o Activos.
  let anio: AnioElegido | null = null;
  if (anioId) {
    const elegido = await db.query<AnioElegido & { estado: string }>(
      `SELECT id, anio, estado, fecha_inicio::text AS fecha_inicio,
              fecha_fin::text AS fecha_fin
       FROM convi.anios_academicos WHERE id = $1`,
      [anioId],
    );
    const fila = elegido.rows[0];
    if (!fila)
      throw errorDeCampos(
        { anio_academico_id: 'Elige un año académico de tu escuela.' },
        MENSAJE,
      );
    if (!ANIOS_EDITABLES.includes(fila.estado))
      throw errorDeCampos(
        {
          anio_academico_id: `El año ${fila.anio} está cerrado. Elige un año planificado o activo.`,
        },
        MENSAJE,
      );
    anio = {
      id: fila.id,
      anio: fila.anio,
      fecha_inicio: fila.fecha_inicio,
      fecha_fin: fila.fecha_fin,
    };
  }

  // Cursos no usa personas; los otros tipos conservan todo su contexto.
  const personas =
    tipo === 'CURSOS'
      ? { rows: [] }
      : await db.query<{
          id: string;
          nombres: string;
          apellidos: string;
          rut: string | null;
          correo: string | null;
          estudiante_id: string | null;
          codigo_estudiante: string | null;
          estado_estudiante: string | null;
          cuenta_id: string | null;
          codigo_perfil: string | null;
          estado_cuenta: string | null;
          correo_cuenta: string | null;
        }>(
          `SELECT p.id, p.nombres, p.apellidos, p.rut, lower(p.correo) AS correo,
            e.id AS estudiante_id, e.codigo_estudiante,
            e.estado AS estado_estudiante,
            m.id AS cuenta_id, m.codigo_perfil, m.estado AS estado_cuenta,
            lower(m.correo_invitacion) AS correo_cuenta
     FROM convi.personas p
     LEFT JOIN convi.estudiantes e ON e.persona_id = p.id
     LEFT JOIN convi.membresias_establecimiento m ON m.persona_id = p.id
     ORDER BY p.creado_en`,
        );
  const contexto: Contexto = {
    hoy: hoy.rows[0].hoy,
    anio,
    porRut: new Map(),
    porCorreo: new Map(),
    porCorreoDeCuenta: new Map(),
    porCodigoEstudiante: new Map(),
    porNombre: new Map(),
    niveles: new Map(),
    cursos: new Map(),
    matriculas: new Map(),
    asignaciones: new Map(),
    vinculos: new Map(),
  };
  for (const fila of personas.rows) {
    const persona: PersonaExistente = {
      id: fila.id,
      nombre: `${fila.nombres} ${fila.apellidos}`,
      rut: fila.rut,
      correo: fila.correo,
      estudiante:
        fila.estudiante_id && fila.codigo_estudiante && fila.estado_estudiante
          ? {
              id: fila.estudiante_id,
              codigo: fila.codigo_estudiante,
              estado: fila.estado_estudiante,
            }
          : null,
      cuenta:
        fila.cuenta_id &&
        fila.codigo_perfil &&
        fila.estado_cuenta &&
        fila.correo_cuenta
          ? {
              id: fila.cuenta_id,
              perfil: fila.codigo_perfil,
              estado: fila.estado_cuenta,
              correo: fila.correo_cuenta,
            }
          : null,
    };
    if (persona.rut) contexto.porRut.set(persona.rut, persona);
    // Con correo repetido se queda la ficha más antigua, como en PB-010.
    if (persona.correo && !contexto.porCorreo.has(persona.correo))
      contexto.porCorreo.set(persona.correo, persona);
    if (persona.cuenta)
      contexto.porCorreoDeCuenta.set(persona.cuenta.correo, persona);
    if (persona.estudiante)
      contexto.porCodigoEstudiante.set(persona.estudiante.codigo, persona);
    const nombre = claveDeNombre(fila.nombres, fila.apellidos);
    const mismoNombre = contexto.porNombre.get(nombre);
    if (mismoNombre) mismoNombre.push(persona);
    else contexto.porNombre.set(nombre, [persona]);
  }

  if (tipo === 'CURSOS') {
    const niveles = await db.query<{ codigo: string; activo: boolean }>(
      `SELECT codigo, activo FROM convi.niveles_educativos`,
    );
    for (const nivel of niveles.rows)
      contexto.niveles.set(nivel.codigo, { activo: nivel.activo });
  }

  if (anio) {
    const cursos = await db.query<CursoExistente>(
      `SELECT id, codigo, nombre, estado FROM convi.cursos
       WHERE anio_academico_id = $1`,
      [anio.id],
    );
    for (const curso of cursos.rows) contexto.cursos.set(curso.codigo, curso);
  }

  if (tipo === 'ESTUDIANTES' || tipo === 'MATRICULAS') {
    const matriculas = await db.query<{
      estudiante_id: string;
      curso_id: string;
      curso_nombre: string;
      anio: number;
      desde: string;
      hasta: string | null;
    }>(
      `SELECT m.estudiante_id, m.curso_id, c.nombre AS curso_nombre, an.anio,
              m.matriculado_en::text AS desde, m.finalizado_en::text AS hasta
       FROM convi.matriculas m
       JOIN convi.cursos c ON c.id = m.curso_id
       JOIN convi.anios_academicos an ON an.id = m.anio_academico_id
       ORDER BY m.matriculado_en DESC`,
    );
    contexto.matriculas = agrupar(matriculas.rows, (m) => m.estudiante_id);
  }

  if (tipo === 'ASIGNACIONES' && anio) {
    const asignaciones = await db.query<{
      curso_id: string;
      cuenta_id: string;
      rol: Rol;
      desde: string | null;
      hasta: string | null;
      nombre: string;
    }>(
      `SELECT a.curso_id, a.membresia_id AS cuenta_id, a.rol_asignacion AS rol,
              a.fecha_inicio::text AS desde, a.fecha_fin::text AS hasta,
              p.nombres || ' ' || p.apellidos AS nombre
       FROM convi.asignaciones_docentes a
       JOIN convi.cursos c ON c.id = a.curso_id
       JOIN convi.membresias_establecimiento m ON m.id = a.membresia_id
       JOIN convi.personas p ON p.id = m.persona_id
       WHERE c.anio_academico_id = $1`,
      [anio.id],
    );
    contexto.asignaciones = agrupar(asignaciones.rows, (a) => a.curso_id);
  }

  if (tipo === 'APODERADOS') {
    const vinculos = await db.query<{
      estudiante_id: string;
      persona_id: string;
      principal: boolean;
      vigente: boolean;
      nombre: string;
    }>(
      `SELECT a.estudiante_id, a.persona_apoderado_id AS persona_id,
              a.es_principal AS principal,
              (a.activo_hasta IS NULL OR a.activo_hasta >= $1::date) AS vigente,
              p.nombres || ' ' || p.apellidos AS nombre
       FROM convi.apoderados_estudiante a
       JOIN convi.personas p ON p.id = a.persona_apoderado_id`,
      [contexto.hoy],
    );
    contexto.vinculos = agrupar(vinculos.rows, (v) => v.estudiante_id);
  }

  return contexto;
}
