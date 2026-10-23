import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';

// PB-152 (HU-131) y PB-054 (HU-047): el estado del caso solo cambia agregando
// un movimiento a historial_estados_caso (CA2); el trigger aplicar_estado lo
// copia al caso. Se valida aquí aunque el formulario también lo haga (HU-119);
// la base vuelve a exigir el motivo, el flujo permitido, el resumen y la
// justificación de pendientes al cerrar y que el caso no haya cambiado (CA3).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** HU-131: etapas entre las que se mueve un caso abierto. */
export const ESTADOS_INTERMEDIOS = [
  'EN_ANALISIS',
  'EN_REVISION',
  'EN_INTERVENCION',
  'EN_SEGUIMIENTO',
] as const;

// Decisión del PO (por defecto): mismos largos que el resto del portal.
export const LARGO_MAXIMO_MOTIVO_ESTADO = 500;
export const LARGO_MAXIMO_RESUMEN_CIERRE = 4000;
export const LARGO_MAXIMO_JUSTIFICACION_PENDIENTES = 2000;

export type CambioEstado = {
  estado_nuevo: (typeof ESTADOS_INTERMEDIOS)[number];
  motivo: string;
  /** El último movimiento que veía la persona, o null si no había (CA3). */
  movimiento_anterior_id: string | null;
};

export type Cierre = {
  motivo: string;
  resumen_cierre: string;
  /** Obligatoria si quedan tareas sin terminar (HU-047 CA2). */
  justificacion_pendientes: string | null;
  /** Acta del mismo caso, opcional (HU-047 CA1). */
  evidencia_cierre_id: string | null;
  movimiento_anterior_id: string | null;
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

/** Un identificador opcional: null si viene vacío y false si no es válido. */
function idOpcional(valor: unknown): string | null | false {
  if (valor === null || valor === '') return null;
  return typeof valor === 'string' && UUID.test(valor)
    ? valor.toLowerCase()
    : false;
}

const RECARGAR = 'Recarga la página e inténtalo nuevamente.';

export function validarCambioEstado(cuerpo: unknown): CambioEstado {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};

  const estado = ESTADOS_INTERMEDIOS.find((e) => e === datos.estado_nuevo);
  if (!estado) errores.estado_nuevo = 'Elige el nuevo estado del caso.';

  // CA1: el motivo es obligatorio.
  const motivo = texto(datos.motivo);
  const errorMotivo = revisarTexto(
    motivo,
    'Explica por qué cambia el estado.',
    LARGO_MAXIMO_MOTIVO_ESTADO,
  );
  if (errorMotivo) errores.motivo = errorMotivo;

  // CA3: hay que indicar el último movimiento que se veía, aunque no hubiera.
  const anterior = idOpcional(datos.movimiento_anterior_id);
  if (anterior === false) errores.estado_nuevo = RECARGAR;

  if (!estado || anterior === false || Object.keys(errores).length > 0) {
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. El estado no cambió.',
      errores,
    });
  }
  return { estado_nuevo: estado, motivo, movimiento_anterior_id: anterior };
}

export function validarCierre(cuerpo: unknown): Cierre {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};

  // HU-047 CA1: motivo y resumen de cierre obligatorios.
  const motivo = texto(datos.motivo);
  const errorMotivo = revisarTexto(
    motivo,
    'Indica el motivo del cierre.',
    LARGO_MAXIMO_MOTIVO_ESTADO,
  );
  if (errorMotivo) errores.motivo = errorMotivo;

  const resumen = texto(datos.resumen_cierre);
  const errorResumen = revisarTexto(
    resumen,
    'Escribe el resumen de cierre: qué se hizo y en qué terminó el caso.',
    LARGO_MAXIMO_RESUMEN_CIERRE,
  );
  if (errorResumen) errores.resumen_cierre = errorResumen;

  const justificacion = texto(datos.justificacion_pendientes);
  if (justificacion.length > LARGO_MAXIMO_JUSTIFICACION_PENDIENTES)
    errores.justificacion_pendientes = `El texto admite hasta ${LARGO_MAXIMO_JUSTIFICACION_PENDIENTES} caracteres.`;

  const acta = idOpcional(datos.evidencia_cierre_id ?? null);
  if (acta === false)
    errores.evidencia_cierre_id = 'Elige un acta de la lista.';

  const anterior = idOpcional(datos.movimiento_anterior_id);
  if (anterior === false) errores.motivo = RECARGAR;

  if (acta === false || anterior === false || Object.keys(errores).length > 0) {
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. El caso no se cerró.',
      errores,
    });
  }
  return {
    motivo,
    resumen_cierre: resumen,
    justificacion_pendientes: justificacion || null,
    evidencia_cierre_id: acta,
    movimiento_anterior_id: anterior,
  };
}

/** El último movimiento del historial: la versión del estado que se ve. */
export async function ultimoMovimiento(
  db: PoolClient,
  casoId: string,
): Promise<string | null> {
  const resultado = await db.query<{ id: string }>(
    `SELECT id FROM convi.historial_estados_caso
     WHERE caso_id = $1
     ORDER BY cambiado_en DESC, id DESC LIMIT 1`,
    [casoId],
  );
  return resultado.rows[0]?.id ?? null;
}

/** Movimiento del historial, para mostrarlo en el detalle (CA1). */
export type MovimientoEstado = {
  id: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  motivo: string;
  cambiado_por: string;
  cambiado_en: Date;
  resumen_cierre: string | null;
  justificacion_pendientes: string | null;
  /** Título del acta de cierre, si se adjuntó una. */
  acta: string | null;
};

export async function movimientosDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<MovimientoEstado[]> {
  const movimientos = await db.query<MovimientoEstado>(
    `SELECT h.id, h.estado_anterior, h.estado_nuevo, h.motivo, h.cambiado_en,
            p.nombres || ' ' || p.apellidos AS cambiado_por,
            h.resumen_cierre, h.justificacion_pendientes, e.titulo AS acta
     FROM convi.historial_estados_caso h
     JOIN convi.membresias_establecimiento m ON m.id = h.cambiado_por
     JOIN convi.personas p ON p.id = m.persona_id
     LEFT JOIN convi.evidencias e ON e.id = h.evidencia_cierre_id
     WHERE h.caso_id = $1
     ORDER BY h.cambiado_en, h.id`,
    [casoId],
  );
  return movimientos.rows;
}

/**
 * Estados a los que puede pasar el caso desde el actual, según el flujo que
 * guarda la base (HU-131 CA4 y CA5). La reapertura es otro ítem (HU-051).
 */
export async function estadosPermitidos(
  db: PoolClient,
  estadoActual: string,
): Promise<{ intermedios: string[]; cierre: boolean }> {
  const permitidos = await db.query<{ estado: string }>(
    `SELECT t.estado FROM unnest($2::text[]) WITH ORDINALITY AS t(estado, orden)
     WHERE convi.transicion_caso_permitida($1, t.estado)
     ORDER BY t.orden`,
    [estadoActual, [...ESTADOS_INTERMEDIOS, 'CERRADO']],
  );
  const estados = permitidos.rows.map((fila) => fila.estado);
  return {
    intermedios: estados.filter((e) => e !== 'CERRADO'),
    cierre: estados.includes('CERRADO'),
  };
}

/** Tareas sin terminar que obligan a justificar el cierre (HU-047 CA2). */
export type PendientesCaso = {
  actuaciones: number;
  compromisos: number;
  acciones_plan: number;
  pasos_protocolo: number;
};

// Mismas condiciones que revisa el trigger validar_relaciones al cerrar.
export async function pendientesDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<PendientesCaso> {
  const pendientes = await db.query<PendientesCaso>(
    `SELECT
       (SELECT count(*) FROM convi.actuaciones
        WHERE caso_id = $1 AND estado IN ('PLANIFICADA', 'POSPUESTA'))::int AS actuaciones,
       (SELECT count(*) FROM convi.compromisos
        WHERE caso_id = $1 AND estado NOT IN ('COMPLETADO', 'CANCELADO'))::int AS compromisos,
       (SELECT count(*) FROM convi.acciones_plan_intervencion x
        JOIN convi.planes_intervencion p ON p.id = x.plan_intervencion_id
        WHERE p.caso_id = $1 AND x.estado NOT IN ('COMPLETADO', 'CANCELADO'))::int AS acciones_plan,
       (SELECT count(*) FROM convi.estados_pasos_protocolo_caso x
        JOIN convi.protocolos_caso p ON p.id = x.protocolo_caso_id
        WHERE p.caso_id = $1 AND x.estado NOT IN ('COMPLETADO', 'OMITIDO'))::int AS pasos_protocolo`,
    [casoId],
  );
  return pendientes.rows[0];
}

export function hayPendientes(pendientes: PendientesCaso) {
  return Object.values(pendientes).some((cantidad) => cantidad > 0);
}

/** Acta que se puede adjuntar al cierre (HU-047 CA1). */
export type ActaCaso = { id: string; titulo: string; fecha_documento: Date };

// Mismo criterio que revisa la base: un acta del caso, de una de sus
// actuaciones, de una situación vinculada o de uno de sus compromisos.
export async function actasDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<ActaCaso[]> {
  const actas = await db.query<ActaCaso>(
    `SELECT e.id, e.titulo, e.fecha_documento
     FROM convi.evidencias e
     LEFT JOIN convi.actuaciones x ON x.id = e.actuacion_id
     LEFT JOIN convi.situaciones z ON z.id = e.situacion_id
     LEFT JOIN convi.compromisos k ON k.id = e.compromiso_id
     WHERE e.tipo_evidencia = 'ACTA'
       AND coalesce(e.caso_id, x.caso_id, z.caso_id, k.caso_id) = $1
     ORDER BY e.fecha_documento DESC, e.creado_en DESC`,
    [casoId],
  );
  return actas.rows;
}
