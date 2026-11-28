// PB-090 (HU-079): cálculo de las reglas de cantidad, sin base de datos.
// motor.service.ts trae de la base cuántas situaciones hubo cada día y aquí
// se decide si la regla se cumple hoy y desde qué día se viene cumpliendo.

export type Operador = 'GT' | 'GE' | 'LT' | 'LE' | 'EQ';
export type AmbitoConteo = 'ESTUDIANTE' | 'CURSO' | 'ESTABLECIMIENTO';

/**
 * Al guardar una situación el conteo solo puede subir, así que una regla de
 * «menos de» no puede pasar a cumplirse en ese momento: solo se evalúan
 * «más de», «al menos» y «exactamente».
 */
export const OPERADORES_AL_GUARDAR: readonly Operador[] = ['GT', 'GE', 'EQ'];

/**
 * Cuántos días hacia atrás se busca el comienzo de una racha. Una condición
 * que se cumple sin parar por más de un año vuelve a generar su alerta.
 */
export const DIAS_HACIA_ATRAS = 365;

const MS_POR_DIA = 86_400_000;

/** 'AAAA-MM-DD' a un número de día, para sumar y restar días sin horas. */
export function numeroDeDia(dia: string): number {
  const [anio, mes, diaDelMes] = dia.split('-').map(Number);
  return Date.UTC(anio, mes - 1, diaDelMes) / MS_POR_DIA;
}

export function diaDeNumero(numero: number): string {
  return new Date(numero * MS_POR_DIA).toISOString().slice(0, 10);
}

export function cumple(
  valor: number,
  operador: Operador,
  umbral: number,
): boolean {
  switch (operador) {
    case 'GT':
      return valor > umbral;
    case 'GE':
      return valor >= umbral;
    case 'LT':
      return valor < umbral;
    case 'LE':
      return valor <= umbral;
    case 'EQ':
      return valor === umbral;
  }
}

export type Recurrencia = {
  /** Situaciones que cuentan, por día de la escuela ('AAAA-MM-DD'). */
  porDia: ReadonlyMap<string, number>;
  /** Hoy en la escuela. */
  hoy: string;
  /** null acumula desde el primer día de conteo sin sacar días anteriores. */
  ventanaDias: number | null;
  operador: Operador;
  umbral: number;
  /** Primer día en que se busca la racha: la vigencia de la regla o un año atrás. */
  inicio: string;
  /** Primer día cuyos hechos pueden contar. */
  primerDia?: string;
};

export type RecurrenciaCumplida = {
  conteo: number;
  /** Primer día que cuenta para el resultado de hoy. */
  desde: string;
  hasta: string;
  /** Primer día de la racha de días seguidos en que la regla se cumple hasta hoy. */
  cumpleDesde: string;
};

/**
 * HU-079 CA6: cada día se cuentan todas las situaciones de su ventana, aunque
 * ya aparezcan en otra alerta. Si hoy no se cumple, devuelve null. Si se
 * cumple, también devuelve desde qué día se viene cumpliendo sin parar:
 * mientras siga la misma racha no se genera otra alerta, y si se cortó y
 * vuelve a cumplirse, la racha es nueva.
 */
// REGLA DE NEGOCIO
// La regla cuenta situaciones del ámbito y período configurados y detecta cuándo se cruza el umbral.
export function evaluarRecurrencia(
  datos: Recurrencia,
  primeraCoincidencia = false,
): RecurrenciaCumplida | null {
  const hoy = numeroDeDia(datos.hoy);
  const inicio = numeroDeDia(datos.inicio);
  if (inicio > hoy) return null;
  const ventana = datos.ventanaDias;
  const limite = numeroDeDia(datos.primerDia ?? datos.inicio);
  const primero =
    ventana === null ? limite : Math.max(limite, inicio - ventana + 1);
  const cantidad = (dia: number) => datos.porDia.get(diaDeNumero(dia)) ?? 0;
  let conteo = 0;
  let racha: number | null = null;
  let hasta = hoy;
  for (let dia = primero; dia <= hoy; dia++) {
    conteo += cantidad(dia);
    if (ventana !== null && dia - ventana >= primero)
      conteo -= cantidad(dia - ventana);
    if (dia >= inicio) {
      racha = cumple(conteo, datos.operador, datos.umbral)
        ? (racha ?? dia)
        : null;
      if (primeraCoincidencia && racha !== null) {
        hasta = dia;
        break;
      }
    }
  }
  if (racha === null) return null;

  return {
    conteo,
    desde: diaDeNumero(
      ventana === null ? primero : Math.max(primero, hasta - ventana + 1),
    ),
    hasta: diaDeNumero(hasta),
    cumpleDesde: diaDeNumero(racha),
  };
}

/**
 * Identifica el hecho que hizo cumplir la regla: código, versión, ámbito,
 * registro y el día en que empezó la racha. El índice único alerta_unica
 * impide guardar dos veces la misma alerta si la evaluación se repite.
 */
export function claveEvento(datos: {
  codigoRegla: string;
  version: number;
  ambito: AmbitoConteo | 'CASO';
  registroId: string | null;
  cumpleDesde: string;
}): string {
  return [
    datos.codigoRegla,
    `v${datos.version}`,
    datos.ambito,
    datos.registroId ?? 'escuela',
    datos.cumpleDesde,
  ].join(':');
}

const SIMBOLO: Record<Operador, string> = {
  GT: '>',
  GE: '≥',
  LT: '<',
  LE: '≤',
  EQ: '=',
};

const CONDICION: Record<Operador, string> = {
  GT: 'más de',
  GE: 'al menos',
  LT: 'menos de',
  LE: 'como máximo',
  EQ: 'exactamente',
};

const SUJETO: Record<AmbitoConteo, string> = {
  ESTUDIANTE: 'de un estudiante',
  CURSO: 'de un curso',
  ESTABLECIMIENTO: 'en la escuela',
};

/** HU-079 CA3: la explicación del cálculo, sin nombres ni descripciones. */
export function explicacion(datos: {
  ambito: AmbitoConteo;
  categoriaId: string | null;
  ventanaDias: number;
  operador: Operador;
  umbral: number;
  resultado: RecurrenciaCumplida;
  situacionId: string | null;
}) {
  const { resultado: r } = datos;
  return {
    metrica: 'CONTEO_SITUACIONES',
    ambito: datos.ambito,
    categoria_id: datos.categoriaId,
    ventana_dias: datos.ventanaDias,
    periodo: { desde: r.desde, hasta: r.hasta },
    conteo: r.conteo,
    operador: datos.operador,
    umbral: datos.umbral,
    formula: `situaciones entre ${r.desde} y ${r.hasta} ${SIMBOLO[datos.operador]} ${datos.umbral}: ${r.conteo} ${SIMBOLO[datos.operador]} ${datos.umbral}`,
    cumple_desde: r.cumpleDesde,
    situacion_evaluada_id: datos.situacionId,
  };
}

/** HU-079 CA7: texto del aviso para Convivencia, en una sola oración y sin datos personales. */
export function textoAviso(datos: {
  codigoRegla: string;
  nombre: string;
  prioridad: string;
  ambito: AmbitoConteo;
  ventanaDias: number;
  operador: Operador;
  umbral: number;
  conteo: number;
  periodo?: Pick<RecurrenciaCumplida, 'desde' | 'hasta'>;
}) {
  const situaciones = datos.conteo === 1 ? 'situación' : 'situaciones';
  const periodo = datos.periodo
    ? `del ${fechaDeAviso(datos.periodo.desde)} al ${fechaDeAviso(datos.periodo.hasta)}`
    : `en los últimos ${datos.ventanaDias} días`;
  return {
    titulo: tituloAviso(datos.prioridad, datos.nombre),
    cuerpo: `Se cumplió la regla ${datos.codigoRegla} con ${datos.conteo} ${situaciones} ${SUJETO[datos.ambito]} ${periodo}, y la regla pide ${CONDICION[datos.operador]} ${datos.umbral}`,
  };
}

function fechaDeAviso(dia: string) {
  return dia.split('-').reverse().join('/');
}

export function textoCierreRecurrencia(datos: {
  nombre: string;
  categoria: string | null;
  ambito: AmbitoConteo;
  operador: Operador;
  umbral: number;
  desde: string;
  hasta: string;
  maximo: number;
}) {
  const categoria = datos.categoria ? ` de ${datos.categoria}` : '';
  const cantidad = datos.umbral === 1 ? 'situación' : 'situaciones';
  return {
    titulo: 'Terminó una regla sin cumplirse',
    cuerpo: `Terminó «${datos.nombre}». Del ${fechaDeAviso(datos.desde)} al ${fechaDeAviso(datos.hasta)} se contaron situaciones${categoria} ${SUJETO[datos.ambito]}. La regla pedía ${CONDICION[datos.operador]} ${datos.umbral} ${cantidad}. El mayor conteo al cierre fue ${datos.maximo}.`,
  };
}

function tituloAviso(prioridad: string, nombre: string) {
  const texto =
    { BAJA: 'baja', MEDIA: 'media', ALTA: 'alta' }[prioridad] ??
    prioridad.toLowerCase();
  return `Alerta de prioridad ${texto}: ${nombre}`.slice(0, 180);
}

// ===== PB-092 (HU-079 CA4): variación entre dos períodos, una vez al día =====

/** Variación porcentual con dos decimales, o null si el período anterior tiene cero. */
// REGLA DE NEGOCIO
// Si el período anterior tuvo cero situaciones, no hay un porcentaje de cambio que comparar.
export function variacionPorcentual(
  actual: number,
  anterior: number,
): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 10000) / 100;
}

export type Variacion = {
  /** Situaciones que cuentan, por día de la escuela ('AAAA-MM-DD'). */
  porDia: ReadonlyMap<string, number>;
  /** Último día cerrado: el día anterior a la evaluación. */
  ayer: string;
  ventanaDias: number;
  operador: Operador;
  umbral: number;
  /** Primer día cerrado que se evalúa: la vigencia de la regla o un año atrás. */
  inicio: string;
};

export type VariacionCumplida = {
  actual: number;
  anterior: number;
  variacion: number;
  periodoActual: { desde: string; hasta: string };
  periodoAnterior: { desde: string; hasta: string };
  /** Último día de la primera ventana de la racha que se cumple hasta ayer. */
  cumpleDesde: string;
};

/**
 * Decisión del PO, ventanas móviles: cada día cerrado se comparan sus últimos
 * N días con los N anteriores. Si el período anterior tiene cero, la
 * variación no se calcula y no se cumple (HU-078 CA4). Devuelve null si ayer
 * no se cumple. Si se cumple, también el día en que empezó la racha, para no
 * repetir la alerta mientras siga cumpliéndose (HU-079 CA6).
 */
// REGLA DE NEGOCIO
// La regla de variación compara dos períodos consecutivos de la misma duración.
export function evaluarVariacion(datos: Variacion): VariacionCumplida | null {
  const ayer = numeroDeDia(datos.ayer);
  const inicio = numeroDeDia(datos.inicio);
  if (inicio > ayer) return null;
  const ventana = datos.ventanaDias;
  const primero = inicio - 2 * ventana + 1;

  // acumulado[i] = situaciones desde el primer día hasta el día primero + i - 1.
  const acumulado = [0];
  for (let dia = primero; dia <= ayer; dia++)
    acumulado.push(
      acumulado[acumulado.length - 1] +
        (datos.porDia.get(diaDeNumero(dia)) ?? 0),
    );
  const hasta = (dia: number) => acumulado[dia - primero + 1];
  const valores = (dia: number) => {
    const actual = hasta(dia) - hasta(dia - ventana);
    const anterior = hasta(dia - ventana) - hasta(dia - 2 * ventana);
    return {
      actual,
      anterior,
      variacion: variacionPorcentual(actual, anterior),
    };
  };
  const seCumple = (dia: number) => {
    const { variacion } = valores(dia);
    return (
      variacion !== null && cumple(variacion, datos.operador, datos.umbral)
    );
  };

  if (!seCumple(ayer)) return null;
  let racha = ayer;
  while (racha > inicio && seCumple(racha - 1)) racha--;

  const hoy = valores(ayer);
  return {
    actual: hoy.actual,
    anterior: hoy.anterior,
    variacion: hoy.variacion!,
    periodoActual: {
      desde: diaDeNumero(ayer - ventana + 1),
      hasta: datos.ayer,
    },
    periodoAnterior: {
      desde: diaDeNumero(ayer - 2 * ventana + 1),
      hasta: diaDeNumero(ayer - ventana),
    },
    cumpleDesde: diaDeNumero(racha),
  };
}

const porcentaje = new Intl.NumberFormat('es-CL', {
  maximumFractionDigits: 2,
});

/** HU-079 CA3: períodos, conteos y fórmula de la variación. */
export function explicacionVariacion(datos: {
  ambito: AmbitoConteo;
  categoriaId: string | null;
  ventanaDias: number;
  operador: Operador;
  umbral: number;
  resultado: VariacionCumplida;
}) {
  const { resultado: r } = datos;
  return {
    metrica: 'VARIACION_PORCENTUAL',
    ambito: datos.ambito,
    categoria_id: datos.categoriaId,
    ventana_dias: datos.ventanaDias,
    periodo_actual: r.periodoActual,
    periodo_anterior: r.periodoAnterior,
    conteo_actual: r.actual,
    conteo_anterior: r.anterior,
    variacion: r.variacion,
    operador: datos.operador,
    umbral: datos.umbral,
    formula: `(${r.actual} − ${r.anterior}) / ${r.anterior} × 100 = ${r.variacion} % ${SIMBOLO[datos.operador]} ${datos.umbral} %`,
    cumple_desde: r.cumpleDesde,
  };
}

export function textoAvisoVariacion(datos: {
  codigoRegla: string;
  nombre: string;
  prioridad: string;
  ambito: AmbitoConteo;
  ventanaDias: number;
  operador: Operador;
  umbral: number;
  resultado: VariacionCumplida;
}) {
  const { resultado: r } = datos;
  return {
    titulo: tituloAviso(datos.prioridad, datos.nombre),
    cuerpo: `Se cumplió la regla ${datos.codigoRegla}: las situaciones ${SUJETO[datos.ambito]} pasaron de ${r.anterior} a ${r.actual} entre dos períodos de ${datos.ventanaDias} días (${porcentaje.format(r.variacion)} %), y la regla pide ${CONDICION[datos.operador]} ${porcentaje.format(datos.umbral)} %`,
  };
}

// ===== PB-091 (HU-079 CA4): vencimientos de un caso, una vez al día =====

/** Lo que cuenta cada tipo de regla de vencimientos (decisión del PO). */
export type Vencido = {
  tipo:
    | 'compromisos'
    | 'acciones_plan_intervencion'
    | 'actuaciones'
    | 'estados_pasos_protocolo_caso';
  id: string;
};

/**
 * HU-079 CA6: no se repite la alerta mientras siga vencido algo de lo que ya
 * avisó una alerta anterior de la misma regla y caso. Si todo eso se puso al
 * día y vence otra cosa, la alerta es nueva.
 */
export function yaAvisado(
  vencidos: readonly Vencido[],
  anteriores: readonly (readonly Vencido[])[],
): boolean {
  const actuales = new Set(vencidos.map((v) => v.id));
  return anteriores.some((lista) => lista.some((v) => actuales.has(v.id)));
}

export function explicacionVencidos(datos: {
  tipoRegla: 'FECHA_LIMITE' | 'PLAZO_PROTOCOLO';
  alCierreDe: string;
  operador: Operador;
  umbral: number;
  vencidos: readonly Vencido[];
}) {
  const conteo = datos.vencidos.length;
  const porTipo: Record<string, number> = {};
  for (const v of datos.vencidos) porTipo[v.tipo] = (porTipo[v.tipo] ?? 0) + 1;
  return {
    metrica: 'CONTEO_VENCIDOS',
    ambito: 'CASO',
    tipo_regla: datos.tipoRegla,
    al_cierre_de: datos.alCierreDe,
    conteo,
    por_tipo: porTipo,
    operador: datos.operador,
    umbral: datos.umbral,
    formula: `vencidos al cierre del ${datos.alCierreDe} ${SIMBOLO[datos.operador]} ${datos.umbral}: ${conteo} ${SIMBOLO[datos.operador]} ${datos.umbral}`,
    vencidos: datos.vencidos,
  };
}

export function textoAvisoVencidos(datos: {
  tipoRegla: 'FECHA_LIMITE' | 'PLAZO_PROTOCOLO';
  codigoRegla: string;
  nombre: string;
  prioridad: string;
  operador: Operador;
  umbral: number;
  conteo: number;
}) {
  const uno = datos.conteo === 1;
  const que =
    datos.tipoRegla === 'PLAZO_PROTOCOLO'
      ? uno
        ? 'paso de protocolo vencido'
        : 'pasos de protocolo vencidos'
      : uno
        ? 'vencimiento entre compromisos, acciones del plan y seguimientos'
        : 'vencimientos entre compromisos, acciones del plan y seguimientos';
  return {
    titulo: tituloAviso(datos.prioridad, datos.nombre),
    cuerpo: `Se cumplió la regla ${datos.codigoRegla} con ${datos.conteo} ${que} de un caso, y la regla pide ${CONDICION[datos.operador]} ${datos.umbral}`,
  };
}
