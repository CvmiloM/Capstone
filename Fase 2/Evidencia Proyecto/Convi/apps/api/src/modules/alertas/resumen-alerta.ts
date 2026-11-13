/** Describe el cálculo guardado, sin reinterpretar fórmulas ni evaluar reglas. */
export function resumenAlerta(
  e: Record<string, unknown> | null | undefined,
): string {
  if (!e) return 'Abre la alerta para revisar sus antecedentes.';
  const operadores: Record<string, string> = {
    GE: 'al menos',
    GT: 'más de',
    LE: 'como máximo',
    LT: 'menos de',
    EQ: 'exactamente',
  };
  const numero = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v)
      ? v.toLocaleString('es-CL')
      : null;
  const umbral = numero(e.umbral);
  const operador =
    typeof e.operador === 'string' ? operadores[e.operador] : null;
  const condicion =
    operador && umbral !== null
      ? ` La regla se cumple con ${operador} ${umbral}`
      : '';
  if (e.metrica === 'VARIACION_PORCENTUAL') {
    const variacion = numero(e.variacion);
    return variacion === null
      ? 'La variación no es calculable con los registros guardados; revisa ambos períodos.'
      : `La cantidad de situaciones varió un ${variacion} % respecto del período anterior.${condicion ? `${condicion} %.` : ''}`;
  }
  const conteo = numero(e.conteo);
  if (conteo === null) return 'Abre la alerta para revisar sus antecedentes.';
  if (e.metrica === 'CONTEO_VENCIDOS')
    return `Se ${e.conteo === 1 ? 'detectó 1 registro vencido' : `detectaron ${conteo} registros vencidos`}.${condicion ? `${condicion} registros vencidos.` : ''}`;
  if (e.metrica === 'CONTEO_SITUACIONES')
    return `Se ${e.conteo === 1 ? 'contó 1 situación' : `contaron ${conteo} situaciones`} en el período configurado.${condicion ? `${condicion} situaciones.` : ''}`;
  return 'Abre la alerta para revisar sus antecedentes.';
}
