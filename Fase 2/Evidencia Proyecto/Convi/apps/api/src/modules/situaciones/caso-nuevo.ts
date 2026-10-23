import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';

// PB-053 (HU-046): Convivencia abre un caso a partir de una situación. Se
// valida aquí aunque el formulario también lo haga (HU-119); la base vuelve a
// exigir que lo abra y lo lleve Convivencia activa, asigna el código
// CASO-AAAA-00001, la fecha y el autor de registro (CA5) y copia el plazo de
// cierre de la escuela si existe (CA3).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const LARGO_MAXIMO_TITULO = 220;
export const LARGO_MAXIMO_RESUMEN = 4000;
export const LARGO_MAXIMO_JUSTIFICACION = 2000;

export type NuevoCaso = {
  titulo: string;
  resumen: string;
  /** AAAA-MM-DD, en la hora de la escuela. */
  fecha_inicio: string;
  categoria_principal_id: string | null;
  responsable_id: string;
  /** Obligatoria si ya hay un caso activo con los mismos estudiantes (CA4). */
  justificacion_independiente: string | null;
  /** La última revisión que veía la persona al decidir, o null (PB-139). */
  revision_anterior_id: string | null;
};

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function uuidOpcional(valor: unknown): string | null | 'invalido' {
  if (valor === undefined || valor === null || valor === '') return null;
  return typeof valor === 'string' && UUID.test(valor)
    ? valor.toLowerCase()
    : 'invalido';
}

function esFechaReal(valor: string) {
  if (!FECHA.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return (
    !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
  );
}

export function validarNuevoCaso(cuerpo: unknown): NuevoCaso {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  // CA1: título, resumen, fecha de inicio y responsable son obligatorios.
  const titulo = texto(datos.titulo);
  if (!titulo) errores.titulo = 'Escribe el título del caso.';
  else if (titulo.length > LARGO_MAXIMO_TITULO)
    errores.titulo = `El título admite hasta ${LARGO_MAXIMO_TITULO} caracteres.`;

  const resumen = texto(datos.resumen);
  if (!resumen) errores.resumen = 'Escribe el resumen del caso.';
  else if (resumen.length > LARGO_MAXIMO_RESUMEN)
    errores.resumen = `El resumen admite hasta ${LARGO_MAXIMO_RESUMEN} caracteres.`;

  const fecha = texto(datos.fecha_inicio);
  if (!esFechaReal(fecha))
    errores.fecha_inicio = 'Indica la fecha de inicio del caso.';

  const responsable = uuidOpcional(datos.responsable_id);
  if (!responsable || responsable === 'invalido')
    errores.responsable_id =
      'Elige a la persona de Convivencia responsable del caso.';

  const categoria = uuidOpcional(datos.categoria_principal_id);
  if (categoria === 'invalido')
    errores.categoria_principal_id = 'Elige una categoría de la lista.';

  const justificacion = texto(datos.justificacion_independiente);
  if (justificacion.length > LARGO_MAXIMO_JUSTIFICACION)
    errores.justificacion_independiente = `La justificación admite hasta ${LARGO_MAXIMO_JUSTIFICACION} caracteres.`;

  // PB-139: hay que indicar la última revisión que se veía, aunque no hubiera.
  const anterior = uuidOpcional(datos.revision_anterior_id);
  if (anterior === 'invalido' || datos.revision_anterior_id === undefined)
    errores.titulo = 'Recarga la página e inténtalo nuevamente.';

  if (
    Object.keys(errores).length > 0 ||
    !responsable ||
    responsable === 'invalido' ||
    categoria === 'invalido' ||
    anterior === 'invalido'
  ) {
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se abrió el caso.',
      errores,
    });
  }
  return {
    titulo,
    resumen,
    fecha_inicio: fecha,
    categoria_principal_id: categoria,
    responsable_id: responsable,
    justificacion_independiente: justificacion || null,
    revision_anterior_id: anterior,
  };
}

// La fecha de hoy en la zona horaria de la escuela (HU-021).
export const HOY_ESCUELA = `(now() AT TIME ZONE (SELECT zona_horaria
  FROM convi.establecimientos WHERE id = convi.establecimiento_actual()))::date`;

/** Caso activo que ya comparte estudiantes con la situación (CA4). */
export type CasoRelacionado = {
  id: string;
  codigo: string;
  titulo: string;
  estado_actual: string;
};

/**
 * Casos que no están cerrados y comparten al menos un estudiante con la
 * situación, como participante del caso o de una situación ya vinculada a él.
 */
export async function casosRelacionados(
  db: PoolClient,
  situacionId: string,
): Promise<CasoRelacionado[]> {
  const casos = await db.query<CasoRelacionado>(
    `SELECT c.id, c.codigo, c.titulo, c.estado_actual
     FROM convi.casos c
     WHERE c.estado_actual <> 'CERRADO'
       AND EXISTS (
         SELECT 1 FROM convi.participaciones ps
         JOIN convi.estudiantes e ON e.persona_id = ps.persona_id
         WHERE ps.situacion_id = $1 AND ps.activo_hasta IS NULL
           AND (EXISTS (SELECT 1 FROM convi.participaciones pc
                        WHERE pc.caso_id = c.id AND pc.persona_id = ps.persona_id)
             OR EXISTS (SELECT 1 FROM convi.participaciones po
                        JOIN convi.situaciones so ON so.id = po.situacion_id
                        WHERE so.caso_id = c.id AND po.persona_id = ps.persona_id)))
     ORDER BY c.fecha_inicio DESC, c.codigo DESC`,
    [situacionId],
  );
  return casos.rows;
}

/** Lo que el formulario para abrir un caso necesita de la situación. */
export type OpcionesCaso = {
  categorias: { id: string; nombre: string }[];
  /** La categoría de la situación, para proponerla como principal. */
  categoria_sugerida_id: string | null;
  /** AAAA-MM-DD de hoy en la escuela, para proponerla como fecha de inicio. */
  hoy: string;
  casos_relacionados: CasoRelacionado[];
};

export async function opcionesCaso(
  db: PoolClient,
  situacionId: string,
): Promise<OpcionesCaso> {
  const categorias = await db.query<OpcionesCaso['categorias'][number]>(
    `SELECT id, nombre FROM convi.categorias_convivencia
     WHERE estado = 'ACTIVO' ORDER BY nombre`,
  );
  const base = await db.query<{
    categoria_sugerida_id: string | null;
    hoy: string;
  }>(
    `SELECT s.categoria_id AS categoria_sugerida_id, ${HOY_ESCUELA}::text AS hoy
     FROM convi.situaciones s WHERE s.id = $1`,
    [situacionId],
  );
  return {
    categorias: categorias.rows,
    categoria_sugerida_id: base.rows[0]?.categoria_sugerida_id ?? null,
    hoy: base.rows[0]?.hoy ?? '',
    casos_relacionados: await casosRelacionados(db, situacionId),
  };
}
