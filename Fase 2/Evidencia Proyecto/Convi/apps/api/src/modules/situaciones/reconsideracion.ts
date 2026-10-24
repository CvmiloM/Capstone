import { BadRequestException } from '@nestjs/common';

// PB-050 (HU-043): reconsiderar la decisión de una situación es registrar otra
// decisión (antecedente, descarte, vinculación o caso nuevo) con el motivo del
// cambio; las decisiones anteriores se conservan sin cambios (CA1) y la base
// rechaza una decisión sobre información desactualizada (CA3, PB-139). Una
// situación vinculada a un caso no se reconsidera: no se traslada ni se
// desvincula (HU-045 CA4).

/** Estados que se pueden reconsiderar. */
export const ESTADOS_RECONSIDERABLES = ['ANTECEDENTE', 'DESCARTADA'] as const;
export const LARGO_MAXIMO_MOTIVO_RECONSIDERACION = 1000;

const NOMBRE_DECISION: Record<string, string> = {
  ANTECEDENTE: 'Antecedente',
  DESCARTADA: 'Descartada',
};

export function esReconsiderable(estado: string) {
  return (ESTADOS_RECONSIDERABLES as readonly string[]).includes(estado);
}

/** El motivo opcional del cuerpo; si viene, no puede pasar del largo máximo. */
export function leerMotivoReconsideracion(cuerpo: unknown): string | null {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const motivo =
    typeof datos.motivo_reconsideracion === 'string'
      ? datos.motivo_reconsideracion.trim()
      : '';
  if (motivo.length > LARGO_MAXIMO_MOTIVO_RECONSIDERACION)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se guardó la decisión.',
      errores: {
        motivo_reconsideracion: `El motivo admite hasta ${LARGO_MAXIMO_MOTIVO_RECONSIDERACION} caracteres.`,
      },
    });
  return motivo || null;
}

/**
 * Lo que va al inicio del fundamento de la decisión nueva. Si la situación ya
 * tenía una decisión, el motivo de la reconsideración es obligatorio (HU-043)
 * y queda escrito junto a la decisión que se cambia; si seguía En revisión no
 * se agrega nada.
 */
export function prefijoReconsideracion(
  estado: string,
  motivo: string | null,
): string {
  if (!esReconsiderable(estado)) return '';
  if (!motivo)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se guardó la decisión.',
      errores: {
        motivo_reconsideracion:
          'Explica por qué cambias la decisión que ya tenía la situación.',
      },
    });
  // Decisión del PO (por defecto): el motivo queda al inicio del fundamento,
  // para que se lea igual en la situación y en el historial del estudiante.
  return `Reconsideración de la decisión ${NOMBRE_DECISION[estado]}: ${motivo}. `;
}
