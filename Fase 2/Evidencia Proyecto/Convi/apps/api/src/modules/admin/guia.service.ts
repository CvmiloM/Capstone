import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { codigoAutomatico } from '../academico/codigo-automatico.js';
import { errorDeCampos, validarNuevoCurso } from '../academico/curso.js';
import { validarDatosNivel } from '../academico/nivel-educativo.js';
import {
  leerAvance,
  mismoNivel,
  pasoDe,
  PASOS_OMITIBLES,
  secciones,
  validarBienvenida,
  validarCursosGuia,
  validarVersion,
  type AvanceGuia,
} from './guia.js';

// PB-032 (HU-025) y PB-038 (HU-031): guía inicial del administrador. Solo
// entra una cuenta ADMIN activa con segundo factor (HU-025 CA1). Cualquier
// administrador de la escuela la avanza; la base audita cada cambio de la
// escuela y conserva la fecha de término de la guía.
const ACCESO = { tipo: 'establecimiento', perfiles: ['ADMIN'] } as const;

const TERMINADA =
  'La guía inicial ya terminó. Lo configurado se sigue editando desde el portal.';
const DESACTUALIZADA =
  'Otra persona avanzó la guía mientras la mirabas. Recarga la página para ver su avance.';

/** Huella del avance y de la respuesta de la bienvenida (PB-139). */
const HUELLA = `md5(e.contexto_onboarding::text || coalesce(e.metodo_registro_actual, ''))`;

/** Los pasos guardados, aunque contexto_onboarding no los tenga todavía. */
const PASOS_GUARDADOS = `CASE WHEN jsonb_typeof(e.contexto_onboarding->'pasos') = 'object'
  THEN e.contexto_onboarding->'pasos' ELSE '{}'::jsonb END`;

/** Avance con el paso marcado; $2 = paso y $3 = LISTO u OMITIDO. */
const AVANCE_CON_PASO = `e.contexto_onboarding || jsonb_build_object(
    'iniciada_en', coalesce(e.contexto_onboarding->'iniciada_en', to_jsonb(now())),
    'pasos', ${PASOS_GUARDADOS} || jsonb_build_object($2::text, jsonb_build_object(
      'estado', $3::text, 'en', now(), 'por', convi.membresia_actual())))`;

export type Guia = Omit<AvanceGuia, 'pasos'> & {
  pasos: (AvanceGuia['pasos'][number] & { por_nombre: string | null })[];
  terminada_en: Date | null;
  metodo_registro_actual: string | null;
  version: string;
  /** Zona horaria de la escuela, para mostrar las fechas sin otra consulta. */
  zona_horaria: string;
  /** PB-034: lo que ya existe, para marcarlo en la vista previa. */
  academico: {
    anios: { id: string; anio: number; estado: string }[];
    niveles: { nombre: string; ciclo: string; activo: boolean }[];
    cursos: {
      anio: number;
      nivel: string;
      ciclo: string;
      seccion: string | null;
    }[];
  };
};

export type CursosCreados = {
  id: string;
  anio_creado: boolean;
  anio_activado: boolean;
  niveles_creados: number;
  niveles_existentes: number;
  cursos_creados: number;
  cursos_existentes: number;
};

const NO_SE_CREO = 'Revisa los datos marcados. No se creó nada.';

@Injectable()
export class GuiaAdminService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // HU-031 CA2: el avance se recupera al volver, con quién marcó cada paso.
  consultar(sesion: Sesion): Promise<Guia> {
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const resultado = await db.query<{
        terminada_en: Date | null;
        metodo_registro_actual: string | null;
        contexto_onboarding: unknown;
        version: string;
        zona_horaria: string;
        nombres: Record<string, string>;
        academico: Guia['academico'];
      }>(
        `SELECT e.onboarding_completado_en AS terminada_en, e.metodo_registro_actual,
           e.contexto_onboarding, ${HUELLA} AS version,
           current_setting('TimeZone') AS zona_horaria,
           (SELECT coalesce(jsonb_object_agg(m.id, p.nombres || ' ' || p.apellidos), '{}'::jsonb)
            FROM convi.membresias_establecimiento m
            JOIN convi.personas p ON p.id = m.persona_id
            WHERE m.id::text IN (
              SELECT x.value->>'por' FROM jsonb_each(${PASOS_GUARDADOS}) x)) AS nombres,
           jsonb_build_object(
             'anios', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'id', a.id, 'anio', a.anio, 'estado', a.estado) ORDER BY a.anio DESC), '[]'::jsonb)
               FROM convi.anios_academicos a),
             'niveles', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'nombre', n.nombre, 'ciclo', n.ciclo, 'activo', n.activo) ORDER BY n.orden), '[]'::jsonb)
               FROM convi.niveles_educativos n),
             'cursos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'anio', a.anio, 'nivel', n.nombre, 'ciclo', n.ciclo, 'seccion', c.seccion)), '[]'::jsonb)
               FROM convi.cursos c
               JOIN convi.anios_academicos a ON a.id = c.anio_academico_id
               JOIN convi.niveles_educativos n ON n.id = c.nivel_id
               WHERE a.estado <> 'CERRADO')
           ) AS academico
         FROM convi.establecimientos e WHERE e.id = $1`,
        [sesion.establecimiento_id],
      );
      const fila = resultado.rows[0];
      if (!fila) throw new NotFoundException('Escuela no disponible');
      const avance = leerAvance(fila.contexto_onboarding);
      return {
        ...avance,
        pasos: avance.pasos.map((p) => ({
          ...p,
          por_nombre: p.por ? (fila.nombres[p.por] ?? null) : null,
        })),
        terminada_en: fila.terminada_en,
        metodo_registro_actual: fila.metodo_registro_actual,
        version: fila.version,
        zona_horaria: fila.zona_horaria,
        academico: fila.academico,
      };
    });
  }

  // PB-032 (HU-025 CA3 y CA4): guarda la respuesta y deja el paso Listo, u
  // omite el paso sin guardar respuestas.
  guardarBienvenida(sesion: Sesion, cuerpo: unknown): Promise<{ id: string }> {
    const datos = validarBienvenida(cuerpo);
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const cambio =
        datos.accion === 'OMITIR'
          ? await db.query<{ id: string }>(
              `UPDATE convi.establecimientos e SET contexto_onboarding = ${AVANCE_CON_PASO}
               WHERE e.id = $1 AND e.onboarding_completado_en IS NULL AND ${HUELLA} = $4
               RETURNING e.id`,
              [
                sesion.establecimiento_id,
                'bienvenida',
                'OMITIDO',
                datos.version,
              ],
            )
          : await db.query<{ id: string }>(
              `UPDATE convi.establecimientos e
               SET metodo_registro_actual = $5,
                   contexto_onboarding = ${AVANCE_CON_PASO}
                     || jsonb_build_object('bienvenida',
                          jsonb_build_object('otro', $6::text, 'mejorar', $7::text))
               WHERE e.id = $1 AND e.onboarding_completado_en IS NULL AND ${HUELLA} = $4
               RETURNING e.id`,
              [
                sesion.establecimiento_id,
                'bienvenida',
                'LISTO',
                datos.version,
                datos.metodo,
                datos.otro,
                datos.mejorar,
              ],
            );
      if (cambio.rows[0]) return cambio.rows[0];
      return rechazarCambio(db, sesion.establecimiento_id);
    });
  }

  // PB-038 (HU-031 CA3): omitir un paso no crea registros ni envía
  // invitaciones; queda Omitido, que no es Listo, y se puede volver a él.
  omitirPaso(
    sesion: Sesion,
    paso: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const clave = pasoDe(paso);
    if (!clave || !PASOS_OMITIBLES.includes(clave))
      throw new BadRequestException({
        mensaje: 'Este paso no se omite desde aquí.',
        errores: { paso: 'Recarga la página e inténtalo nuevamente.' },
      });
    const version = validarVersion(cuerpo);
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const cambio = await db.query<{ id: string }>(
        `UPDATE convi.establecimientos e SET contexto_onboarding = ${AVANCE_CON_PASO}
         WHERE e.id = $1 AND e.onboarding_completado_en IS NULL AND ${HUELLA} = $4
         RETURNING e.id`,
        [sesion.establecimiento_id, clave, 'OMITIDO', version],
      );
      if (cambio.rows[0]) return cambio.rows[0];
      return rechazarCambio(db, sesion.establecimiento_id);
    });
  }

  // PB-034 (HU-027): crea el año, los niveles y los cursos elegidos y deja el
  // paso Listo. Usa las mismas reglas del portal (validaciones de año, nivel y
  // curso, códigos automáticos y bloqueos de codigo-automatico.ts y de las
  // secciones), pero en una sola transacción (PB-138): si algo falla no queda
  // nada a medias, y con muchos cursos responde en un solo viaje por tabla.
  // CA3: reutiliza los niveles que ya existen y no repite cursos.
  guardarCursos(sesion: Sesion, cuerpo: unknown): Promise<CursosCreados> {
    const datos = validarCursosGuia(cuerpo);
    return this.cuentas.operar(
      sesion,
      ACCESO,
      async (db) => {
        try {
          return await crearCursos(db, sesion.establecimiento_id, datos);
        } catch (error) {
          if ((error as { code?: string } | null)?.code === '23505')
            throw new ConflictException(
              'Otra persona creó años, niveles o cursos al mismo tiempo. Recarga la página y vuelve a confirmar.',
            );
          throw error;
        }
      },
      'READ COMMITTED',
    );
  }

  // La guía se abre sola hasta que se empieza o se elige ir al portal por
  // ahora (por defecto). Empezarla dos veces no cambia nada.
  iniciar(sesion: Sesion, cuerpo: unknown): Promise<{ id: string }> {
    const version = validarVersion(cuerpo);
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const cambio = await db.query<{ id: string }>(
        `UPDATE convi.establecimientos e
         SET contexto_onboarding = e.contexto_onboarding
           || jsonb_build_object('iniciada_en', to_jsonb(now()))
         WHERE e.id = $1 AND e.onboarding_completado_en IS NULL
           AND e.contexto_onboarding->'iniciada_en' IS NULL AND ${HUELLA} = $2
         RETURNING e.id`,
        [sesion.establecimiento_id, version],
      );
      if (cambio.rows[0]) return cambio.rows[0];
      const actual = await db.query<{ lista: boolean }>(
        `SELECT e.onboarding_completado_en IS NOT NULL
             OR e.contexto_onboarding->'iniciada_en' IS NOT NULL AS lista
         FROM convi.establecimientos e WHERE e.id = $1`,
        [sesion.establecimiento_id],
      );
      if (!actual.rows[0]) throw new NotFoundException('Escuela no disponible');
      if (actual.rows[0].lista) return { id: sesion.establecimiento_id };
      throw new ConflictException(DESACTUALIZADA);
    });
  }
}

/** Explica por qué no se guardó: la guía terminó u otra persona la avanzó. */
async function rechazarCambio(db: PoolClient, escuela: string): Promise<never> {
  const actual = await db.query<{ terminada: boolean }>(
    `SELECT e.onboarding_completado_en IS NOT NULL AS terminada
     FROM convi.establecimientos e WHERE e.id = $1`,
    [escuela],
  );
  if (!actual.rows[0]) throw new NotFoundException('Escuela no disponible');
  throw new ConflictException(
    actual.rows[0].terminada ? TERMINADA : DESACTUALIZADA,
  );
}

async function crearCursos(
  db: PoolClient,
  escuela: string,
  datos: ReturnType<typeof validarCursosGuia>,
): Promise<CursosCreados> {
  // La escuela queda bloqueada: dos administradores no confirman a la vez.
  const actual = await db.query<{ terminada: boolean; version: string }>(
    `SELECT e.onboarding_completado_en IS NOT NULL AS terminada, ${HUELLA} AS version
     FROM convi.establecimientos e WHERE e.id = $1 FOR UPDATE`,
    [escuela],
  );
  if (!actual.rows[0]) throw new NotFoundException('Escuela no disponible');
  if (actual.rows[0].terminada) throw new ConflictException(TERMINADA);
  if (actual.rows[0].version !== datos.version)
    throw new ConflictException(DESACTUALIZADA);

  // Año: el que ya existe con ese número, o uno nuevo Planificado (HU-011 CA3).
  let anio = (
    await db.query<{ id: string; estado: string }>(
      'SELECT id, estado FROM convi.anios_academicos WHERE anio = $1 FOR UPDATE',
      [datos.anio],
    )
  ).rows[0];
  const anioCreado = !anio;
  if (anio?.estado === 'CERRADO')
    throw errorDeCampos(
      {
        anio: `El año ${datos.anio} está cerrado: ya no se le agregan cursos.`,
      },
      NO_SE_CREO,
    );
  if (!anio)
    anio = (
      await db.query<{ id: string; estado: string }>(
        `INSERT INTO convi.anios_academicos
           (establecimiento_id, anio, fecha_inicio, fecha_fin, estado)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, 'PLANIFICADO')
         RETURNING id, estado`,
        [datos.anio, datos.fecha_inicio, datos.fecha_fin],
      )
    ).rows[0];

  // Activarlo sigue la regla de Años académicos: un solo año activo.
  let anioActivado = false;
  if (datos.activar && anio.estado === 'PLANIFICADO') {
    const activo = await db.query<{ anio: number }>(
      `SELECT anio FROM convi.anios_academicos WHERE estado = 'ACTIVO'`,
    );
    if (activo.rows[0])
      throw new ConflictException(
        `El año ${activo.rows[0].anio} ya está activo. Desmarca «Activar el año» o ciérralo primero en Años académicos.`,
      );
    await db.query(
      `UPDATE convi.anios_academicos SET estado = 'ACTIVO' WHERE id = $1`,
      [anio.id],
    );
    anioActivado = true;
  }

  // Niveles: se reutiliza el que ya existe con el mismo nombre y ciclo, sin
  // modificarlo. Los nuevos siguen los códigos y el orden automáticos.
  const primerNivel = numero(await codigoAutomatico(db, 'nivel'));
  const existentes = await db.query<{
    id: string;
    nombre: string;
    ciclo: string;
    activo: boolean;
  }>('SELECT id, nombre, ciclo, activo FROM convi.niveles_educativos');
  let orden = (
    await db.query<{ orden: number }>(
      'SELECT coalesce(max(orden), 0)::int AS orden FROM convi.niveles_educativos',
    )
  ).rows[0].orden;
  const idDeNivel = new Map<string, string>();
  const nuevosNiveles: ReturnType<typeof validarDatosNivel>[] = [];
  for (const { nivel } of datos.niveles) {
    const previo = existentes.rows.find(
      (n) => n.ciclo === nivel.ciclo && mismoNivel(n.nombre, nivel.nombre),
    );
    if (previo && !previo.activo)
      throw errorDeCampos(
        {
          niveles: `El nivel ${previo.nombre} está desactivado. Actívalo en Niveles educativos o desmárcalo.`,
        },
        NO_SE_CREO,
      );
    if (previo) idDeNivel.set(nivel.clave, previo.id);
    else
      nuevosNiveles.push(
        validarDatosNivel({
          codigo: `NIV-${String(primerNivel + nuevosNiveles.length).padStart(3, '0')}`,
          nombre: nivel.nombre,
          orden: ++orden,
          ciclo: nivel.ciclo,
          tramo: nivel.tramo,
        }),
      );
  }
  if (nuevosNiveles.length > 0) {
    const creados = await db.query<{ id: string; nombre: string }>(
      `INSERT INTO convi.niveles_educativos
         (establecimiento_id, codigo, nombre, orden, ciclo, tramo)
       SELECT convi.establecimiento_actual(), x.codigo, x.nombre, x.orden, x.ciclo, x.tramo
       FROM jsonb_to_recordset($1::jsonb)
         AS x(codigo text, nombre text, orden int, ciclo text, tramo text)
       RETURNING id, nombre`,
      [JSON.stringify(nuevosNiveles)],
    );
    for (const { nivel } of datos.niveles) {
      const creado = creados.rows.find((n) => n.nombre === nivel.nombre);
      if (creado) idDeNivel.set(nivel.clave, creado.id);
    }
  }

  // Cursos: el mismo bloqueo que revisa las secciones en Cursos, y no se
  // crea un nivel con una sección que ya existe en el año (CA3).
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('curso-seccion:' || convi.establecimiento_actual()::text || ':' || $1, 0))",
    [anio.id],
  );
  const yaEstan = new Set(
    (
      await db.query<{ clave: string }>(
        `SELECT nivel_id || ':' || upper(coalesce(seccion, '')) AS clave
         FROM convi.cursos WHERE anio_academico_id = $1`,
        [anio.id],
      )
    ).rows.map((c) => c.clave),
  );
  const primerCurso = numero(await codigoAutomatico(db, 'curso', anio.id));
  const nuevosCursos: ReturnType<typeof validarNuevoCurso>[] = [];
  let existentesCursos = 0;
  for (const { nivel, secciones: cantidad } of datos.niveles) {
    const nivelId = idDeNivel.get(nivel.clave)!;
    for (const seccion of secciones(cantidad)) {
      if (yaEstan.has(`${nivelId}:${seccion}`)) {
        existentesCursos++;
        continue;
      }
      nuevosCursos.push(
        validarNuevoCurso({
          anio_academico_id: anio.id,
          nivel_id: nivelId,
          codigo: `CUR-${String(primerCurso + nuevosCursos.length).padStart(4, '0')}`,
          nombre: `${nivel.nombre} ${seccion}`,
          seccion,
        }),
      );
    }
  }
  if (nuevosCursos.length > 0)
    await db.query(
      `INSERT INTO convi.cursos
         (establecimiento_id, anio_academico_id, nivel_id, codigo, nombre, seccion)
       SELECT convi.establecimiento_actual(), $1, x.nivel_id, x.codigo, x.nombre, x.seccion
       FROM jsonb_to_recordset($2::jsonb)
         AS x(nivel_id uuid, codigo text, nombre text, seccion text)`,
      [anio.id, JSON.stringify(nuevosCursos)],
    );

  // HU-031: el paso queda Listo con quién y cuándo.
  await db.query(
    `UPDATE convi.establecimientos e SET contexto_onboarding = ${AVANCE_CON_PASO}
     WHERE e.id = $1`,
    [escuela, 'cursos', 'LISTO'],
  );
  return {
    id: escuela,
    anio_creado: anioCreado,
    anio_activado: anioActivado,
    niveles_creados: nuevosNiveles.length,
    niveles_existentes: datos.niveles.length - nuevosNiveles.length,
    cursos_creados: nuevosCursos.length,
    cursos_existentes: existentesCursos,
  };
}

/** El número de un código automático, como 7 en CUR-0007. */
function numero(codigo: string) {
  return Number(codigo.slice(codigo.indexOf('-') + 1));
}
