import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  errorDeCampos,
  validarSituacionConvivencia,
  type SituacionConvivencia,
} from './nueva-situacion.js';

// PB-075 (HU-065): situaciones de años anteriores que Convivencia incorpora a
// mano. Se registran como cualquier situación de Convivencia (PB-043), con su
// fecha real, y quedan marcadas como registro histórico (CA1). Decisión del
// PO (Camilo): quedan como antecedente con una conclusión obligatoria, porque
// son hechos pasados que no deben quedar pendientes en la bandeja. No hay
// carga masiva: se registran de a una (CA4).

export const LARGO_MAXIMO_CONCLUSION = 2000;

export type RegistroHistorico = SituacionConvivencia & { conclusion: string };

/**
 * Valida la situación igual que el registro de Convivencia y además la
 * conclusión. Devuelve todos los errores a la vez.
 */
export function validarRegistroHistorico(cuerpo: unknown): RegistroHistorico {
  const datos =
    typeof cuerpo === 'object' && cuerpo !== null
      ? (cuerpo as Record<string, unknown>)
      : {};
  const conclusion =
    typeof datos.conclusion === 'string' ? datos.conclusion.trim() : '';
  const errores: Record<string, string> = {};
  if (!conclusion) errores.conclusion = 'Escribe cómo terminó la situación.';
  else if (conclusion.length > LARGO_MAXIMO_CONCLUSION)
    errores.conclusion = `La conclusión admite hasta ${LARGO_MAXIMO_CONCLUSION} caracteres.`;

  let situacion: SituacionConvivencia | null = null;
  try {
    situacion = validarSituacionConvivencia(cuerpo);
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const respuesta = error.getResponse() as {
      errores?: Record<string, string>;
    };
    Object.assign(errores, respuesta.errores);
  }
  if (!situacion || Object.keys(errores).length > 0)
    throw errorDeCampos(errores);
  return { ...situacion, conclusion };
}

/**
 * Deja como antecedente la situación recién insertada, en la misma
 * transacción: pasa de Nueva a En revisión y se registra la decisión con la
 * conclusión, igual que una revisión de Convivencia (el trigger aplicar_revision
 * cambia el estado). Es su primera revisión, así que no tiene anterior.
 */
export async function guardarComoAntecedente(
  db: PoolClient,
  situacionId: string,
  conclusion: string,
) {
  await db.query(
    `UPDATE convi.situaciones SET estado = 'EN_REVISION' WHERE id = $1`,
    [situacionId],
  );
  await db.query(
    `INSERT INTO convi.revisiones_convivencia
       (establecimiento_id, situacion_id, tipo_revision, resultado,
        fundamento, revisado_por)
     VALUES (convi.establecimiento_actual(), $1, 'DECISION', 'ANTECEDENTE',
             $2, convi.membresia_actual())`,
    [situacionId, conclusion],
  );
}