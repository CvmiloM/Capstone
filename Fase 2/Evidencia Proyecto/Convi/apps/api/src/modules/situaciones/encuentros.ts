import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  LARGO_MAXIMO_MOTIVO_PLAN,
  PERFILES_RESPONSABLE_ACCION,
  ZONA_ESCUELA,
} from './plan-intervencion.js';

// PB-063 y PB-064 (HU-055): encuentros del caso (entrevistas, reuniones,
// mediaciones y otras actuaciones que no son seguimientos). Se valida aquí
// aunque el formulario también lo haga (HU-119); la base vuelve a exigir el
// resultado al realizarlo, la fecha programada mientras está planificado, el
// término posterior al inicio, el motivo al reprogramar y que las fechas
// reales no sean futuras (CA6).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fecha y hora de un campo datetime-local, en la hora de la escuela. */
const FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;
const VERSION = /^[0-9a-f]{32}$/;

/** Decisión del PO (por defecto): el seguimiento tiene su propio ítem (PB-068). */
export const TIPOS_ENCUENTRO = [
  'ENTREVISTA',
  'REUNION',
  'MEDIACION',
  'INTERVENCION',
  'ACOMPANAMIENTO',
] as const;
/** Estados en que el encuentro todavía puede realizarse, reprogramarse o cancelarse. */
export const ENCUENTRO_ABIERTO = ['PLANIFICADA', 'POSPUESTA'];
/** CA4: asistencia de cada participante al registrar el encuentro. */
export const ASISTENCIAS = ['ASISTIO', 'NO_ASISTIO', 'JUSTIFICADO'] as const;
/** Quiénes asisten: estudiantes del caso, sus apoderados y el equipo. */
export const ROLES_ASISTENTE = ['ESTUDIANTE', 'APODERADO', 'EQUIPO'] as const;

// Decisión del PO (por defecto): mismos largos que el resto del portal; el
// lugar, el de la base.
export const LARGO_MAXIMO_OBJETIVO_ENCUENTRO = 1000;
export const LARGO_MAXIMO_DESCRIPCION_ENCUENTRO = 2000;
export const LARGO_MAXIMO_LUGAR = 160;
export const LARGO_MAXIMO_RESULTADO = 4000;
export const MAXIMO_ASISTENTES = 40;

/** Una fecha y hora en la zona horaria de la escuela, como timestamptz. */
export const EN_LA_ESCUELA = (parametro: string) =>
  `(${parametro}::timestamp AT TIME ZONE ${ZONA_ESCUELA})`;

export type Asistente = {
  persona_id: string;
  rol: (typeof ROLES_ASISTENTE)[number];
};

export type NuevoEncuentro = {
  tipo: (typeof TIPOS_ENCUENTRO)[number];
  objetivo: string;
  descripcion: string | null;
  responsable_id: string;
  lugar: string;
  /** AAAA-MM-DDTHH:MM en la hora de la escuela. */
  programado_en: string;
  fin_programado_en: string | null;
  accion_plan_id: string | null;
  asistentes: Asistente[];
};

export type Reprogramacion = {
  programado_en: string;
  fin_programado_en: string | null;
  motivo: string;
  version: string;
};

export type Realizacion = {
  realizado_en: string;
  fin_real_en: string | null;
  resultado: string;
  asistencia: {
    participacion_id: string;
    estado: (typeof ASISTENCIAS)[number];
  }[];
  version: string;
};

export type Cancelacion = { motivo: string; version: string };

function datosDe(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** Texto obligatorio con largo máximo; devuelve el error o null. */
function revisarTexto(valor: string, vacio: string, largo: number) {
  if (!valor) return vacio;
  if (valor.length > largo) return `El texto admite hasta ${largo} caracteres.`;
  return null;
}

/** Fecha y hora real del calendario, normalizada a AAAA-MM-DDTHH:MM. */
export function fechaHora(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const partes = FECHA_HORA.exec(valor.trim());
  if (!partes) return null;
  const [anio, mes, dia, hora, minuto] = partes.slice(1).map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    anio < 2000 ||
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia ||
    hora > 23 ||
    minuto > 59
  )
    return null;
  return partes[0].slice(0, 16);
}

/** CA2: el término, si se indica, es una fecha válida que no va antes del inicio. */
function revisarTermino(
  inicio: string | null,
  valor: unknown,
  errores: Record<string, string>,
  campo: string,
) {
  if (valor === null || valor === undefined || valor === '') return null;
  const termino = fechaHora(valor);
  if (!termino) errores[campo] = 'Indica una fecha y hora válidas.';
  else if (inicio && termino < inicio)
    errores[campo] = 'El término no puede ser anterior al inicio.';
  return termino;
}

function version(valor: unknown) {
  return typeof valor === 'string' && VERSION.test(valor) ? valor : null;
}

function rechazar(mensaje: string, errores: Record<string, string>): never {
  throw new BadRequestException({ mensaje, errores });
}

const RECARGAR = 'Recarga la página e inténtalo nuevamente.';

/** Asistentes sin repetir; false si alguno no es válido. */
export function leerAsistentes(valor: unknown): Asistente[] | false {
  if (!Array.isArray(valor) || valor.length > MAXIMO_ASISTENTES) return false;
  const vistos = new Map<string, Asistente>();
  for (const item of valor) {
    const datos = datosDe(item);
    const persona = texto(datos.persona_id).toLowerCase();
    const rol = ROLES_ASISTENTE.find((r) => r === datos.rol);
    if (!UUID.test(persona) || !rol) return false;
    vistos.set(`${rol}:${persona}`, { persona_id: persona, rol });
  }
  return [...vistos.values()];
}

// CA1 y CA3: tipo, objetivo, responsable de Convivencia, lugar y fecha
// programada obligatorios; descripción, término y acción del plan opcionales.
// Decisión del PO (por defecto): al menos un asistente.
export function validarNuevoEncuentro(cuerpo: unknown): NuevoEncuentro {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const tipo = TIPOS_ENCUENTRO.find((t) => t === datos.tipo);
  if (!tipo) errores.tipo = 'Elige el tipo de encuentro.';
  const objetivo = texto(datos.objetivo);
  const errorObjetivo = revisarTexto(
    objetivo,
    'Escribe el objetivo del encuentro.',
    LARGO_MAXIMO_OBJETIVO_ENCUENTRO,
  );
  if (errorObjetivo) errores.objetivo = errorObjetivo;
  const descripcion = texto(datos.descripcion);
  if (descripcion.length > LARGO_MAXIMO_DESCRIPCION_ENCUENTRO)
    errores.descripcion = `El texto admite hasta ${LARGO_MAXIMO_DESCRIPCION_ENCUENTRO} caracteres.`;
  const responsable = texto(datos.responsable_id);
  if (!UUID.test(responsable))
    errores.responsable_id = 'Elige a la persona de Convivencia responsable.';
  const lugar = texto(datos.lugar);
  const errorLugar = revisarTexto(
    lugar,
    'Indica dónde será el encuentro.',
    LARGO_MAXIMO_LUGAR,
  );
  if (errorLugar) errores.lugar = errorLugar;
  const inicio = fechaHora(datos.programado_en);
  if (!inicio) errores.programado_en = 'Indica la fecha y hora programadas.';
  const termino = revisarTermino(
    inicio,
    datos.fin_programado_en,
    errores,
    'fin_programado_en',
  );
  const accion = datos.accion_plan_id;
  const accionId =
    accion === null || accion === undefined || accion === ''
      ? null
      : typeof accion === 'string' && UUID.test(accion)
        ? accion.toLowerCase()
        : false;
  if (accionId === false)
    errores.accion_plan_id = 'Elige una acción del plan de la lista.';
  const asistentes = leerAsistentes(datos.asistentes ?? []);
  if (asistentes === false)
    errores.asistentes = 'Elige los asistentes de la lista.';
  else if (asistentes.length === 0)
    errores.asistentes = 'Elige al menos un asistente.';
  if (
    !tipo ||
    !inicio ||
    accionId === false ||
    asistentes === false ||
    Object.keys(errores).length > 0
  )
    rechazar(
      'Revisa los datos marcados. No se programó el encuentro.',
      errores,
    );
  return {
    tipo,
    objetivo,
    descripcion: descripcion || null,
    responsable_id: responsable.toLowerCase(),
    lugar,
    programado_en: inicio,
    fin_programado_en: termino,
    accion_plan_id: accionId,
    asistentes,
  };
}

// PB-063 (CA5): cambiar la fecha programada exige motivo.
export function validarReprogramacion(cuerpo: unknown): Reprogramacion {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const inicio = fechaHora(datos.programado_en);
  if (!inicio) errores.programado_en = 'Indica la nueva fecha y hora.';
  const termino = revisarTermino(
    inicio,
    datos.fin_programado_en,
    errores,
    'fin_programado_en',
  );
  const motivo = texto(datos.motivo);
  const errorMotivo = revisarTexto(
    motivo,
    'Explica por qué cambia la fecha.',
    LARGO_MAXIMO_MOTIVO_PLAN,
  );
  if (errorMotivo) errores.motivo = errorMotivo;
  const vista = version(datos.version);
  if (!vista) errores.motivo = RECARGAR;
  if (!inicio || !vista || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. El encuentro no cambió.', errores);
  return {
    programado_en: inicio,
    fin_programado_en: termino,
    motivo,
    version: vista,
  };
}

// PB-064 (CA3 y CA4): inicio real y resultado obligatorios, término real
// opcional y la asistencia de cada participante.
export function validarRealizacion(cuerpo: unknown): Realizacion {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const inicio = fechaHora(datos.realizado_en);
  if (!inicio) errores.realizado_en = 'Indica cuándo empezó el encuentro.';
  const termino = revisarTermino(
    inicio,
    datos.fin_real_en,
    errores,
    'fin_real_en',
  );
  const resultado = texto(datos.resultado);
  const errorResultado = revisarTexto(
    resultado,
    'Escribe el resultado del encuentro.',
    LARGO_MAXIMO_RESULTADO,
  );
  if (errorResultado) errores.resultado = errorResultado;
  const asistencia: Realizacion['asistencia'] = [];
  const lista = Array.isArray(datos.asistencia) ? datos.asistencia : null;
  if (!lista || lista.length > MAXIMO_ASISTENTES)
    errores.asistencia = 'Marca la asistencia de cada participante.';
  else
    for (const item of lista) {
      const fila = datosDe(item);
      const id = texto(fila.participacion_id).toLowerCase();
      const estado = ASISTENCIAS.find((a) => a === fila.estado);
      if (!UUID.test(id)) {
        errores.asistencia = RECARGAR;
        break;
      }
      if (!estado) {
        errores[`asistencia_${id}`] =
          'Marca si asistió, no asistió o se justificó.';
        continue;
      }
      asistencia.push({ participacion_id: id, estado });
    }
  const vista = version(datos.version);
  if (!vista) errores.resultado = RECARGAR;
  if (!inicio || !vista || Object.keys(errores).length > 0)
    rechazar(
      'Revisa los datos marcados. El encuentro no se registró.',
      errores,
    );
  return {
    realizado_en: inicio,
    fin_real_en: termino,
    resultado,
    asistencia,
    version: vista,
  };
}

// Decisión del PO (por defecto): cancelar exige motivo y queda en la auditoría.
export function validarCancelacion(cuerpo: unknown): Cancelacion {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const motivo = texto(datos.motivo);
  const errorMotivo = revisarTexto(
    motivo,
    'Explica por qué se cancela el encuentro.',
    LARGO_MAXIMO_MOTIVO_PLAN,
  );
  if (errorMotivo) errores.motivo = errorMotivo;
  const vista = version(datos.version);
  if (!vista) errores.motivo = RECARGAR;
  if (!vista || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. El encuentro no se canceló.', errores);
  return { motivo, version: vista };
}

/** Persona que puede asistir a un encuentro del caso, con su rol. */
export type AsistentePosible = Asistente & {
  nombre: string;
  /** Código del estudiante, estudiantes del apoderado o perfiles del equipo. */
  detalle: string | null;
};

// Estudiantes que siguen en el caso, sus apoderados con vínculo vigente hoy y
// las personas del equipo con cuenta activa.
export async function asistentesPosibles(
  db: PoolClient,
  casoId: string,
): Promise<AsistentePosible[]> {
  const hoy = `(now() AT TIME ZONE ${ZONA_ESCUELA})::date`;
  const personas = await db.query<AsistentePosible>(
    `WITH estudiantes AS (
       SELECT e.id, p.id AS persona_id, p.nombres, p.apellidos, e.codigo_estudiante
       FROM convi.participaciones pa
       JOIN convi.estudiantes e ON e.persona_id = pa.persona_id
       JOIN convi.personas p ON p.id = pa.persona_id
       WHERE pa.caso_id = $1 AND pa.activo_hasta IS NULL
     )
     SELECT persona_id, 'ESTUDIANTE' AS rol, nombres || ' ' || apellidos AS nombre,
            codigo_estudiante AS detalle, 1 AS orden, apellidos, nombres
     FROM estudiantes
     UNION ALL
     SELECT pp.id, 'APODERADO', pp.nombres || ' ' || pp.apellidos,
            'de ' || string_agg(DISTINCT es.nombres, ', '), 2, pp.apellidos, pp.nombres
     FROM estudiantes es
     JOIN convi.apoderados_estudiante ae ON ae.estudiante_id = es.id
     JOIN convi.personas pp ON pp.id = ae.persona_apoderado_id
     WHERE (ae.activo_desde IS NULL OR ae.activo_desde <= ${hoy})
       AND (ae.activo_hasta IS NULL OR ae.activo_hasta >= ${hoy})
     GROUP BY pp.id
     UNION ALL
     SELECT p.id, 'EQUIPO', p.nombres || ' ' || p.apellidos,
            string_agg(DISTINCT m.codigo_perfil, ', '), 3, p.apellidos, p.nombres
     FROM convi.membresias_establecimiento m
     JOIN convi.personas p ON p.id = m.persona_id
     WHERE m.estado = 'ACTIVO' AND m.codigo_perfil = ANY($2::text[])
     GROUP BY p.id
     ORDER BY orden, apellidos, nombres, persona_id`,
    [casoId, PERFILES_RESPONSABLE_ACCION],
  );
  return personas.rows.map(({ persona_id, rol, nombre, detalle }) => ({
    persona_id,
    rol,
    nombre,
    detalle,
  }));
}

/** CA1: profesionales de Convivencia activos que pueden ser responsables. */
export async function responsablesDeEncuentro(
  db: PoolClient,
): Promise<{ id: string; nombre: string }[]> {
  const responsables = await db.query<{ id: string; nombre: string }>(
    `SELECT m.id, p.nombres || ' ' || p.apellidos AS nombre
     FROM convi.membresias_establecimiento m
     JOIN convi.personas p ON p.id = m.persona_id
     WHERE m.codigo_perfil = 'CONVIVENCIA' AND m.estado = 'ACTIVO'
     ORDER BY p.apellidos, p.nombres`,
  );
  return responsables.rows;
}

/** Acciones abiertas del plan vigente, a las que se puede ligar un encuentro. */
export async function accionesParaEncuentro(
  db: PoolClient,
  casoId: string,
): Promise<{ id: string; descripcion: string }[]> {
  const acciones = await db.query<{ id: string; descripcion: string }>(
    `SELECT a.id, a.descripcion
     FROM convi.acciones_plan_intervencion a
     JOIN convi.planes_intervencion pl ON pl.id = a.plan_intervencion_id
     WHERE pl.caso_id = $1 AND pl.estado IN ('BORRADOR', 'ACTIVO')
       AND a.estado IN ('PENDIENTE', 'EN_PROGRESO', 'VENCIDO')
     ORDER BY a.vence_en, a.creado_en`,
    [casoId],
  );
  return acciones.rows;
}

export type Encuentro = {
  id: string;
  tipo: string;
  estado: string;
  objetivo: string;
  descripcion: string | null;
  lugar: string | null;
  responsable: string;
  creado_por: string;
  creado_en: Date;
  programado_en: Date | null;
  fin_programado_en: Date | null;
  /** AAAA-MM-DDTHH:MM en la hora de la escuela, para reprogramar. */
  programado_local: string | null;
  fin_programado_local: string | null;
  realizado_en: Date | null;
  fin_real_en: Date | null;
  resultado: string | null;
  /** Acción del plan a la que se ligó, si se ligó. */
  accion: string | null;
  /** CA5: cambios de fecha, con la fecha anterior y el motivo del último. */
  reprogramaciones: number;
  fecha_anterior: Date | null;
  motivo_reprogramacion: string | null;
  motivo_cancelacion: string | null;
  version: string;
  asistentes: {
    participacion_id: string;
    persona_id: string;
    nombre: string;
    rol: string;
    estado_asistencia: string;
  }[];
};

// Los pendientes primero, por fecha programada; luego el resto, del más reciente.
export async function encuentrosDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<Encuentro[]> {
  const encuentros = await db.query<Omit<Encuentro, 'asistentes'>>(
    `SELECT a.id, a.tipo_actuacion AS tipo, a.estado, a.objetivo, a.descripcion,
            a.lugar, pr.nombres || ' ' || pr.apellidos AS responsable,
            pc.nombres || ' ' || pc.apellidos AS creado_por, a.creado_en,
            a.programado_en, a.fin_programado_en,
            to_char(a.programado_en AT TIME ZONE ${ZONA_ESCUELA}, 'YYYY-MM-DD"T"HH24:MI') AS programado_local,
            to_char(a.fin_programado_en AT TIME ZONE ${ZONA_ESCUELA}, 'YYYY-MM-DD"T"HH24:MI') AS fin_programado_local,
            a.realizado_en, a.fin_real_en, a.resultado, ap.descripcion AS accion,
            r.reprogramaciones, r.fecha_anterior, r.motivo_reprogramacion,
            (SELECT e.metadatos->>'motivo' FROM convi.eventos_auditoria e
             WHERE e.tipo_recurso = 'actuaciones' AND e.recurso_id = a.id
               AND e.metadatos->'despues'->>'estado' = 'CANCELADA'
               AND e.metadatos->'antes'->>'estado' <> 'CANCELADA'
             ORDER BY e.ocurrido_en DESC LIMIT 1) AS motivo_cancelacion,
            md5(to_jsonb(a)::text) AS version
     FROM convi.actuaciones a
     JOIN convi.membresias_establecimiento mr ON mr.id = a.membresia_responsable_id
     JOIN convi.personas pr ON pr.id = mr.persona_id
     JOIN convi.membresias_establecimiento mc ON mc.id = a.creado_por
     JOIN convi.personas pc ON pc.id = mc.persona_id
     LEFT JOIN convi.acciones_plan_intervencion ap ON ap.id = a.accion_plan_id
     CROSS JOIN LATERAL (
       SELECT count(*)::int AS reprogramaciones,
              (array_agg((e.metadatos->'antes'->>'programado_en')::timestamptz
                 ORDER BY e.ocurrido_en DESC))[1] AS fecha_anterior,
              (array_agg(e.metadatos->>'motivo' ORDER BY e.ocurrido_en DESC))[1]
                AS motivo_reprogramacion
       FROM convi.eventos_auditoria e
       WHERE e.tipo_recurso = 'actuaciones' AND e.recurso_id = a.id
         AND e.metadatos->'antes'->>'programado_en'
             IS DISTINCT FROM e.metadatos->'despues'->>'programado_en'
     ) r
     WHERE a.caso_id = $1 AND a.tipo_actuacion <> 'SEGUIMIENTO'
     ORDER BY a.estado IN ('PLANIFICADA', 'POSPUESTA') DESC,
              CASE WHEN a.estado IN ('PLANIFICADA', 'POSPUESTA') THEN a.programado_en END,
              coalesce(a.realizado_en, a.programado_en, a.creado_en) DESC, a.id`,
    [casoId],
  );
  if (encuentros.rows.length === 0) return [];
  const asistentes = await db.query<
    Encuentro['asistentes'][number] & { actuacion_id: string }
  >(
    `SELECT pa.actuacion_id, pa.id AS participacion_id, pa.persona_id,
            p.nombres || ' ' || p.apellidos AS nombre, pa.rol_contextual AS rol,
            coalesce(pa.estado_asistencia, 'PENDIENTE') AS estado_asistencia
     FROM convi.participaciones pa
     JOIN convi.personas p ON p.id = pa.persona_id
     WHERE pa.actuacion_id = ANY($1::uuid[]) AND pa.activo_hasta IS NULL
     ORDER BY pa.rol_contextual = 'EQUIPO', p.apellidos, p.nombres, pa.id`,
    [encuentros.rows.map((e) => e.id)],
  );
  return encuentros.rows.map((encuentro) => ({
    ...encuentro,
    asistentes: asistentes.rows
      .filter((a) => a.actuacion_id === encuentro.id)
      .map(({ actuacion_id: _actuacion, ...asistente }) => asistente),
  }));
}
