import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';

// PB-061 y PB-062 (HU-054): plan de intervención del caso y sus acciones. Se
// valida aquí aunque el formulario también lo haga (HU-119); la base vuelve a
// exigir el motivo para terminar el plan o corregir una acción, que la fecha
// de cumplimiento no sea futura y que el protocolo sea del mismo caso.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Huella del registro que se veía (md5 de la fila), para PB-139. */
const VERSION = /^[0-9a-f]{32}$/;

// Decisión del PO (por defecto): mismos largos que el resto del portal.
export const LARGO_MAXIMO_OBJETIVO_PLAN = 2000;
export const LARGO_MAXIMO_DESCRIPCION_ACCION = 1000;
export const LARGO_MAXIMO_NOTAS_ACCION = 2000;
export const LARGO_MAXIMO_MOTIVO_PLAN = 500;

/**
 * Decisión del PO (por defecto): la persona responsable de una acción tiene
 * una cuenta activa del equipo de la escuela; apoderados y estudiantes no.
 */
export const PERFILES_RESPONSABLE_ACCION = ['CONVIVENCIA', 'PROFESOR', 'ADMIN'];

export const ESTADOS_INICIALES_PLAN = ['BORRADOR', 'ACTIVO'] as const;
export const ESTADOS_NUEVOS_PLAN = [
  'ACTIVO',
  'COMPLETADO',
  'CANCELADO',
] as const;
export const ESTADOS_NUEVOS_ACCION = [
  'EN_PROGRESO',
  'COMPLETADO',
  'CANCELADO',
] as const;
/** Estados en que un plan todavía recibe acciones y cambios. */
export const PLAN_VIGENTE = ['BORRADOR', 'ACTIVO'];
/** Estados en que una acción todavía avanza. */
export const ACCION_ABIERTA = ['PENDIENTE', 'EN_PROGRESO', 'VENCIDO'];

// Zona horaria de la escuela (HU-021): las fechas de vencimiento y de
// cumplimiento son días de la escuela.
export const ZONA_ESCUELA = `(SELECT zona_horaria FROM convi.establecimientos
  WHERE id = convi.establecimiento_actual())`;
export const HOY = `(now() AT TIME ZONE ${ZONA_ESCUELA})::date`;
/** Un día vence al terminar ese día en la escuela. */
export const FIN_DEL_DIA = (parametro: string) =>
  `((${parametro}::date + 1)::timestamp AT TIME ZONE ${ZONA_ESCUELA}) - interval '1 second'`;
/** Un día cumplido se guarda al empezar ese día, nunca en el futuro (CA3). */
export const INICIO_DEL_DIA = (parametro: string) =>
  `(${parametro}::date::timestamp AT TIME ZONE ${ZONA_ESCUELA})`;

export type NuevoPlan = {
  objetivo: string;
  estado: (typeof ESTADOS_INICIALES_PLAN)[number];
  protocolo_caso_id: string | null;
};

export type CambioEstadoPlan = {
  estado_nuevo: (typeof ESTADOS_NUEVOS_PLAN)[number];
  /** Obligatorio para completar o cancelar (CA5). */
  motivo: string | null;
  version: string;
};

export type NuevaAccion = {
  descripcion: string;
  persona_responsable_id: string;
  /** AAAA-MM-DD. */
  vence_dia: string;
};

export type AvanceAccion = {
  estado_nuevo: (typeof ESTADOS_NUEVOS_ACCION)[number];
  /** Obligatorias al completar (CA3). */
  notas: string | null;
  completado_dia: string | null;
  /** Obligatorio al cancelar. */
  motivo: string | null;
  version: string;
};

export type CorreccionAccion = NuevaAccion & {
  /** Solo cuentan si la acción ya está completada. */
  notas: string | null;
  completado_dia: string | null;
  motivo: string;
  version: string;
};

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

/** Un día real del calendario en formato AAAA-MM-DD. */
export function esDia(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const partes = DIA.exec(valor);
  if (!partes) return false;
  const [anio, mes, dia] = partes.slice(1).map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    anio >= 2000 &&
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function version(valor: unknown) {
  return typeof valor === 'string' && VERSION.test(valor) ? valor : null;
}

function rechazar(mensaje: string, errores: Record<string, string>): never {
  throw new BadRequestException({ mensaje, errores });
}

const RECARGAR = 'Recarga la página e inténtalo nuevamente.';

// CA1: objetivo obligatorio y protocolo aplicado opcional. Decisión del PO
// (por defecto): el plan nace Borrador o Activo.
export function validarNuevoPlan(cuerpo: unknown): NuevoPlan {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const objetivo = texto(datos.objetivo);
  const errorObjetivo = revisarTexto(
    objetivo,
    'Escribe el objetivo del plan.',
    LARGO_MAXIMO_OBJETIVO_PLAN,
  );
  if (errorObjetivo) errores.objetivo = errorObjetivo;
  const estado = ESTADOS_INICIALES_PLAN.find((e) => e === datos.estado);
  if (!estado) errores.estado = 'Elige si el plan queda Borrador o Activo.';
  const protocolo = datos.protocolo_caso_id;
  const protocoloId =
    protocolo === null || protocolo === undefined || protocolo === ''
      ? null
      : typeof protocolo === 'string' && UUID.test(protocolo)
        ? protocolo.toLowerCase()
        : false;
  if (protocoloId === false)
    errores.protocolo_caso_id = 'Elige un protocolo aplicado de la lista.';
  if (!estado || protocoloId === false || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. No se creó el plan.', errores);
  return { objetivo, estado, protocolo_caso_id: protocoloId };
}

// CA5: completar o cancelar exige motivo; activar un borrador no.
export function validarCambioEstadoPlan(cuerpo: unknown): CambioEstadoPlan {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const estado = ESTADOS_NUEVOS_PLAN.find((e) => e === datos.estado_nuevo);
  if (!estado) errores.estado_nuevo = 'Elige el nuevo estado del plan.';
  const motivo = texto(datos.motivo);
  if (estado && estado !== 'ACTIVO') {
    const errorMotivo = revisarTexto(
      motivo,
      'Explica por qué termina el plan.',
      LARGO_MAXIMO_MOTIVO_PLAN,
    );
    if (errorMotivo) errores.motivo = errorMotivo;
  } else if (motivo.length > LARGO_MAXIMO_MOTIVO_PLAN)
    errores.motivo = `El texto admite hasta ${LARGO_MAXIMO_MOTIVO_PLAN} caracteres.`;
  const vista = version(datos.version);
  if (!vista) errores.estado_nuevo = RECARGAR;
  if (!estado || !vista || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. El plan no cambió.', errores);
  return { estado_nuevo: estado, motivo: motivo || null, version: vista };
}

function validarCamposAccion(
  datos: Record<string, unknown>,
  errores: Record<string, string>,
) {
  const descripcion = texto(datos.descripcion);
  const errorDescripcion = revisarTexto(
    descripcion,
    'Describe la acción.',
    LARGO_MAXIMO_DESCRIPCION_ACCION,
  );
  if (errorDescripcion) errores.descripcion = errorDescripcion;
  const responsable = texto(datos.persona_responsable_id);
  if (!UUID.test(responsable))
    errores.persona_responsable_id = 'Elige a la persona responsable.';
  const vence = datos.vence_dia;
  if (!esDia(vence)) errores.vence_dia = 'Indica la fecha de vencimiento.';
  return {
    descripcion,
    persona_responsable_id: responsable.toLowerCase(),
    vence_dia: esDia(vence) ? vence : '',
  };
}

// CA2: descripción, responsable y fecha de vencimiento obligatorias.
export function validarNuevaAccion(cuerpo: unknown): NuevaAccion {
  const errores: Record<string, string> = {};
  const accion = validarCamposAccion(datosDe(cuerpo), errores);
  if (Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. No se agregó la acción.', errores);
  return accion;
}

/** Notas y día de cumplimiento de una acción completada (CA3). */
function validarCumplimiento(
  datos: Record<string, unknown>,
  errores: Record<string, string>,
) {
  const notas = texto(datos.notas);
  const errorNotas = revisarTexto(
    notas,
    'Escribe qué se hizo para cumplir la acción.',
    LARGO_MAXIMO_NOTAS_ACCION,
  );
  if (errorNotas) errores.notas = errorNotas;
  const dia = datos.completado_dia;
  if (!esDia(dia))
    errores.completado_dia = 'Indica el día en que se cumplió la acción.';
  return { notas, completado_dia: esDia(dia) ? dia : null };
}

// Decisión del PO (por defecto): la acción avanza a En progreso, se completa
// con notas y el día en que se cumplió (CA3) o se cancela con un motivo.
// Vencida no se elige: se muestra cuando pasó el día y sigue abierta.
export function validarAvanceAccion(cuerpo: unknown): AvanceAccion {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const estado = ESTADOS_NUEVOS_ACCION.find((e) => e === datos.estado_nuevo);
  if (!estado) errores.estado_nuevo = 'Elige el nuevo estado de la acción.';
  let notas: string | null = null;
  let completado: string | null = null;
  let motivo: string | null = null;
  if (estado === 'COMPLETADO') {
    const cumplimiento = validarCumplimiento(datos, errores);
    notas = cumplimiento.notas;
    completado = cumplimiento.completado_dia;
  }
  if (estado === 'CANCELADO') {
    motivo = texto(datos.motivo);
    const errorMotivo = revisarTexto(
      motivo,
      'Explica por qué se cancela la acción.',
      LARGO_MAXIMO_MOTIVO_PLAN,
    );
    if (errorMotivo) errores.motivo = errorMotivo;
  }
  const vista = version(datos.version);
  if (!vista) errores.estado_nuevo = RECARGAR;
  if (!estado || !vista || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. La acción no cambió.', errores);
  return {
    estado_nuevo: estado,
    notas,
    completado_dia: completado,
    motivo,
    version: vista,
  };
}

// CA4: corregir exige motivo; la auditoría guarda el valor anterior y el
// nuevo. Si la acción ya está completada también se corrigen sus notas y el
// día de cumplimiento, que el servicio exige solo en ese caso.
export function validarCorreccionAccion(
  cuerpo: unknown,
  completada: boolean,
): CorreccionAccion {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const accion = validarCamposAccion(datos, errores);
  const cumplimiento = completada
    ? validarCumplimiento(datos, errores)
    : { notas: null, completado_dia: null };
  const motivo = texto(datos.motivo);
  const errorMotivo = revisarTexto(
    motivo,
    'Explica por qué corriges la acción.',
    LARGO_MAXIMO_MOTIVO_PLAN,
  );
  if (errorMotivo) errores.motivo = errorMotivo;
  const vista = version(datos.version);
  if (!vista) errores.motivo = RECARGAR;
  if (!vista || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. La acción no se corrigió.', errores);
  return { ...accion, ...cumplimiento, motivo, version: vista };
}

/** Acción del plan, como se muestra en el caso. */
export type AccionPlan = {
  id: string;
  descripcion: string;
  persona_responsable_id: string;
  responsable: string;
  /** AAAA-MM-DD en la zona horaria de la escuela. */
  vence_dia: string;
  estado: string;
  /** Sigue abierta y ya pasó su día de vencimiento. */
  vencida: boolean;
  notas: string | null;
  completado_dia: string | null;
  creado_en: Date;
  /** Motivo con que se canceló, si se canceló. */
  motivo_cancelacion: string | null;
  /** CA4: correcciones registradas y el motivo de la última. */
  correcciones: number;
  ultima_correccion: string | null;
  version: string;
};

export type PlanIntervencion = {
  id: string;
  objetivo: string;
  estado: string;
  creado_por: string;
  creado_en: Date;
  protocolo_caso_id: string | null;
  /** Protocolo aplicado que origina el plan (CA1). */
  protocolo: string | null;
  /** CA5: fecha y motivo de término, si se completó o canceló. */
  terminado_en: Date | null;
  motivo_termino: string | null;
  version: string;
  acciones: AccionPlan[];
};

// Los motivos viven en la auditoría (eventos_auditoria.metadatos.motivo).
export async function planesDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<PlanIntervencion[]> {
  const planes = await db.query<Omit<PlanIntervencion, 'acciones'>>(
    `SELECT pl.id, pl.objetivo, pl.estado, pl.creado_en,
            pp.nombres || ' ' || pp.apellidos AS creado_por,
            pl.protocolo_caso_id,
            pr.nombre || ' · versión ' || vp.numero_version AS protocolo,
            coalesce(pl.completado_en, t.ocurrido_en) AS terminado_en,
            t.motivo AS motivo_termino, md5(to_jsonb(pl)::text) AS version
     FROM convi.planes_intervencion pl
     JOIN convi.membresias_establecimiento m ON m.id = pl.creado_por
     JOIN convi.personas pp ON pp.id = m.persona_id
     LEFT JOIN convi.protocolos_caso pc ON pc.id = pl.protocolo_caso_id
     LEFT JOIN convi.versiones_protocolo vp ON vp.id = pc.version_protocolo_id
     LEFT JOIN convi.protocolos pr ON pr.id = vp.protocolo_id
     LEFT JOIN LATERAL (
       SELECT e.ocurrido_en, e.metadatos->>'motivo' AS motivo
       FROM convi.eventos_auditoria e
       WHERE e.tipo_recurso = 'planes_intervencion' AND e.recurso_id = pl.id
         AND e.metadatos->'despues'->>'estado' = pl.estado
         AND e.metadatos->'antes'->>'estado' <> pl.estado
       ORDER BY e.ocurrido_en DESC LIMIT 1
     ) t ON pl.estado IN ('COMPLETADO', 'CANCELADO')
     WHERE pl.caso_id = $1
     ORDER BY pl.creado_en, pl.id`,
    [casoId],
  );
  if (planes.rows.length === 0) return [];
  const acciones = await db.query<
    AccionPlan & { plan_intervencion_id: string }
  >(
    `SELECT a.id, a.plan_intervencion_id, a.descripcion,
            a.persona_responsable_id,
            pr.nombres || ' ' || pr.apellidos AS responsable,
            to_char(a.vence_en AT TIME ZONE ${ZONA_ESCUELA}, 'YYYY-MM-DD') AS vence_dia,
            a.estado,
            a.estado IN ('PENDIENTE', 'EN_PROGRESO') AND a.vence_en < now() AS vencida,
            a.notas,
            to_char(a.completado_en AT TIME ZONE ${ZONA_ESCUELA}, 'YYYY-MM-DD') AS completado_dia,
            a.creado_en,
            (SELECT e.metadatos->>'motivo' FROM convi.eventos_auditoria e
             WHERE e.tipo_recurso = 'acciones_plan_intervencion'
               AND e.recurso_id = a.id
               AND e.metadatos->'despues'->>'estado' = 'CANCELADO'
               AND e.metadatos->'antes'->>'estado' <> 'CANCELADO'
             ORDER BY e.ocurrido_en DESC LIMIT 1) AS motivo_cancelacion,
            c.correcciones, c.ultima_correccion,
            md5(to_jsonb(a)::text) AS version
     FROM convi.acciones_plan_intervencion a
     JOIN convi.personas pr ON pr.id = a.persona_responsable_id
     CROSS JOIN LATERAL (
       SELECT count(*)::int AS correcciones,
              (array_agg(e.metadatos->>'motivo' ORDER BY e.ocurrido_en DESC))[1]
                AS ultima_correccion
       FROM convi.eventos_auditoria e
       WHERE e.tipo_recurso = 'acciones_plan_intervencion' AND e.recurso_id = a.id
         AND e.metadatos->'antes'->>'estado' = e.metadatos->'despues'->>'estado'
         AND nullif(e.metadatos->>'motivo', '') IS NOT NULL
     ) c
     WHERE a.plan_intervencion_id = ANY($1::uuid[])
     ORDER BY a.vence_en, a.creado_en, a.id`,
    [planes.rows.map((p) => p.id)],
  );
  return planes.rows.map((plan) => ({
    ...plan,
    acciones: acciones.rows
      .filter((accion) => accion.plan_intervencion_id === plan.id)
      .map(({ plan_intervencion_id: _plan, ...accion }) => accion),
  }));
}

/** Personas que pueden ser responsables de una acción, con sus perfiles. */
export async function responsablesDeAccion(
  db: PoolClient,
): Promise<{ id: string; nombre: string; perfiles: string[] }[]> {
  const personas = await db.query<{
    id: string;
    nombre: string;
    perfiles: string[];
  }>(
    `SELECT p.id, p.nombres || ' ' || p.apellidos AS nombre,
            array_agg(DISTINCT m.codigo_perfil ORDER BY m.codigo_perfil) AS perfiles
     FROM convi.membresias_establecimiento m
     JOIN convi.personas p ON p.id = m.persona_id
     WHERE m.estado = 'ACTIVO' AND m.codigo_perfil = ANY($1::text[])
     GROUP BY p.id
     ORDER BY p.apellidos, p.nombres, p.id`,
    [PERFILES_RESPONSABLE_ACCION],
  );
  return personas.rows;
}

/** La persona tiene una cuenta activa del equipo de la escuela. */
export async function esResponsableValido(db: PoolClient, personaId: string) {
  const persona = await db.query(
    `SELECT 1 FROM convi.membresias_establecimiento
     WHERE persona_id = $1 AND estado = 'ACTIVO'
       AND codigo_perfil = ANY($2::text[])`,
    [personaId, PERFILES_RESPONSABLE_ACCION],
  );
  return (persona.rowCount ?? 0) > 0;
}
