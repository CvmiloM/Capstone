import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';

// PB-047 (HU-040), PB-048 (HU-041) y PB-051 (HU-044): decisiones que cierran
// la revisión de una situación sin abrir un caso. Se guardan como una
// revisión DECISION; el trigger aplicar_revision cambia el estado en la misma
// transacción y la base no deja editarlas ni borrarlas (cambiar una decisión
// es una reconsideración, PB-050). Se valida aquí aunque el formulario también
// lo haga (HU-119).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO_SITUACION = /^SIT-\d{4}-\d{5}$/;

export const RESULTADOS_DECISION = ['ANTECEDENTE', 'DESCARTADA'] as const;
export const MOTIVOS_DESCARTE = [
  'DUPLICADO',
  'ERRONEO',
  'FUERA_DE_ALCANCE',
] as const;
export const LARGO_MAXIMO_FUNDAMENTO_DECISION = 2000;

// Decisión del PO (Fernando): el motivo del descarte queda al inicio del
// fundamento, para que se lea igual en la situación y en el historial.
const TEXTO_MOTIVO: Record<(typeof MOTIVOS_DESCARTE)[number], string> = {
  DUPLICADO: 'Descartada por duplicado',
  ERRONEO: 'Descartada por error en el registro',
  FUERA_DE_ALCANCE: 'Descartada por estar fuera de alcance',
};

export type NuevaDecision = {
  resultado: (typeof RESULTADOS_DECISION)[number];
  /** Texto que se guarda: la conclusión o el motivo con su fundamento. */
  fundamento: string;
  /** Código de la situación original, solo en un descarte por duplicado. */
  codigo_original: string | null;
  /** La última revisión que veía la persona al decidir, o null (PB-139). */
  revision_anterior_id: string | null;
};

function esDe<T extends string>(
  valor: unknown,
  permitidos: readonly T[],
): valor is T {
  return (
    typeof valor === 'string' &&
    (permitidos as readonly string[]).includes(valor)
  );
}

export function validarDecision(cuerpo: unknown): NuevaDecision {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  const resultado = esDe(datos.resultado, RESULTADOS_DECISION)
    ? datos.resultado
    : null;
  if (!resultado)
    errores.resultado = 'Elige si la guardas como antecedente o la descartas.';

  // HU-040 CA2 y HU-041 CA2: sin fundamento no se guarda.
  const texto =
    typeof datos.fundamento === 'string' ? datos.fundamento.trim() : '';
  if (!texto)
    errores.fundamento =
      resultado === 'DESCARTADA'
        ? 'Explica por qué se descarta.'
        : 'Escribe la conclusión de la revisión.';
  else if (texto.length > LARGO_MAXIMO_FUNDAMENTO_DECISION)
    errores.fundamento = `El texto admite hasta ${LARGO_MAXIMO_FUNDAMENTO_DECISION} caracteres.`;

  // HU-041: el descarte indica su motivo y, si es duplicado, la original (HU-044).
  let motivo: (typeof MOTIVOS_DESCARTE)[number] | null = null;
  let codigo: string | null = null;
  if (resultado === 'DESCARTADA') {
    motivo = esDe(datos.motivo_descarte, MOTIVOS_DESCARTE)
      ? datos.motivo_descarte
      : null;
    if (!motivo)
      errores.motivo_descarte =
        'Elige si es un duplicado, un error en el registro o está fuera de alcance.';
    if (motivo === 'DUPLICADO') {
      const escrito =
        typeof datos.codigo_original === 'string'
          ? datos.codigo_original.trim().toUpperCase()
          : '';
      if (!CODIGO_SITUACION.test(escrito))
        errores.codigo_original =
          'Escribe el código de la situación original, por ejemplo SIT-2026-00012.';
      else codigo = escrito;
    }
  }

  // PB-139: hay que indicar la última revisión que se veía, aunque no hubiera.
  const anterior = datos.revision_anterior_id;
  const anteriorValido =
    anterior === null ||
    anterior === '' ||
    (typeof anterior === 'string' && UUID.test(anterior));
  if (!anteriorValido)
    errores.resultado = 'Recarga la página e inténtalo nuevamente.';

  if (!resultado || Object.keys(errores).length > 0) {
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se guardó la decisión.',
      errores,
    });
  }
  return {
    resultado,
    fundamento: motivo ? `${TEXTO_MOTIVO[motivo]}. ${texto}` : texto,
    codigo_original: codigo,
    revision_anterior_id:
      typeof anterior === 'string' && anterior !== ''
        ? anterior.toLowerCase()
        : null,
  };
}

/** Decisión ya tomada sobre una situación, para mostrarla en el detalle. */
export type DecisionRegistrada = {
  id: string;
  resultado: string;
  fundamento: string;
  revisado_por: string;
  revisado_en: Date;
  /** Código de la situación original, si se descartó por duplicado (HU-044). */
  duplicada_de: string | null;
};

/** La última revisión de cualquier tipo: la base la exige en cada revisión nueva. */
export async function ultimaRevision(
  db: PoolClient,
  situacionId: string,
): Promise<string | null> {
  const resultado = await db.query<{ id: string }>(
    `SELECT id FROM convi.revisiones_convivencia
     WHERE situacion_id = $1
     ORDER BY revisado_en DESC, id DESC LIMIT 1`,
    [situacionId],
  );
  return resultado.rows[0]?.id ?? null;
}

/** Decisiones de una situación, de la más antigua a la más reciente. */
export async function decisionesDeSituacion(
  db: PoolClient,
  situacionId: string,
): Promise<DecisionRegistrada[]> {
  const decisiones = await db.query<DecisionRegistrada>(
    `SELECT r.id, r.resultado, r.fundamento, r.revisado_en,
            p.nombres || ' ' || p.apellidos AS revisado_por,
            o.codigo AS duplicada_de
     FROM convi.revisiones_convivencia r
     JOIN convi.membresias_establecimiento m ON m.id = r.revisado_por
     JOIN convi.personas p ON p.id = m.persona_id
     LEFT JOIN convi.situaciones o ON o.id = r.situacion_duplicada_id
     WHERE r.situacion_id = $1 AND r.tipo_revision = 'DECISION'
     ORDER BY r.revisado_en, r.id`,
    [situacionId],
  );
  return decisiones.rows;
}

/**
 * Guarda la decisión. El trigger aplicar_revision pasa la situación a
 * Antecedente o Descartada en la misma transacción (HU-040 CA1 y HU-041 CA1),
 * sin crear un caso (HU-040 CA3) ni borrar nada.
 */
export async function insertarDecision(
  db: PoolClient,
  situacionId: string,
  datos: NuevaDecision,
  situacionOriginalId: string | null,
): Promise<{ id: string; estado: string }> {
  const decision = await db.query<{ id: string }>(
    `INSERT INTO convi.revisiones_convivencia
       (establecimiento_id, situacion_id, tipo_revision, resultado, fundamento,
        revisado_por, revision_anterior_id, situacion_duplicada_id)
     VALUES (convi.establecimiento_actual(), $1, 'DECISION', $2, $3,
             convi.membresia_actual(), $4, $5)
     RETURNING id`,
    [
      situacionId,
      datos.resultado,
      datos.fundamento,
      datos.revision_anterior_id,
      situacionOriginalId,
    ],
  );
  return { id: decision.rows[0].id, estado: datos.resultado };
}
