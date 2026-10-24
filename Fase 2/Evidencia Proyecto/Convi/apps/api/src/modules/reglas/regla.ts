import { BadRequestException } from '@nestjs/common';

// PB-089 (HU-078): datos de una regla de aviso. Se validan aquí con las mismas
// condiciones que la base (reglas_coherencia_tipo y validar_integracion), para
// responder con un mensaje por campo en vez de un error de la base (CA3).

export const TIPOS = [
  'RECURRENCIA',
  'FECHA_LIMITE',
  'PLAZO_PROTOCOLO',
  'VARIACION_PERIODO',
  'OTRO',
] as const;
export const AMBITOS = [
  'ESTUDIANTE',
  'CURSO',
  'CASO',
  'ESTABLECIMIENTO',
] as const;
export const ACCIONES = ['ALERTA', 'ALERTA_Y_NOTIFICACION'] as const;
export const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA'] as const;
export const OPERADORES = ['GT', 'GE', 'LT', 'LE', 'EQ'] as const;

export type Tipo = (typeof TIPOS)[number];
export type Ambito = (typeof AMBITOS)[number];

export const LARGO_MAXIMO_NOMBRE = 180;
export const VENTANA_MAXIMA_DIAS = 3650;
export const UMBRAL_MAXIMO = 100_000;

/** CA1 a CA4: la métrica la fija el tipo, la persona no la elige. */
export const METRICA_DEL_TIPO: Record<Tipo, string | null> = {
  RECURRENCIA: 'CONTEO_SITUACIONES',
  VARIACION_PERIODO: 'VARIACION_PORCENTUAL',
  FECHA_LIMITE: 'CONTEO_VENCIDOS',
  PLAZO_PROTOCOLO: 'CONTEO_VENCIDOS',
  OTRO: null,
};

/** CA2 y CA3: los ámbitos que el motor sabe contar para cada tipo. */
export const AMBITOS_DEL_TIPO: Record<Tipo, readonly Ambito[]> = {
  RECURRENCIA: ['ESTUDIANTE', 'CURSO', 'ESTABLECIMIENTO'],
  VARIACION_PERIODO: ['ESTUDIANTE', 'CURSO', 'ESTABLECIMIENTO'],
  FECHA_LIMITE: ['CASO'],
  PLAZO_PROTOCOLO: ['CASO'],
  OTRO: AMBITOS,
};

/** CA4: la variación no usa «exactamente». */
export const OPERADORES_DEL_TIPO: Record<Tipo, readonly string[]> = {
  RECURRENCIA: OPERADORES,
  VARIACION_PERIODO: ['GT', 'GE', 'LT', 'LE'],
  FECHA_LIMITE: OPERADORES,
  PLAZO_PROTOCOLO: OPERADORES,
  OTRO: OPERADORES,
};

export type DatosRegla = {
  nombre: string;
  tipo_regla: Tipo;
  codigo_metrica: string | null;
  codigo_operador: string | null;
  valor_umbral: number | null;
  ventana_dias: number | null;
  ventana_comparacion_dias: number | null;
  categoria_id: string | null;
  codigo_ambito: Ambito;
  codigo_accion: string;
  codigo_prioridad: string;
  vigente_desde: string | null;
  vigente_hasta: string | null;
};

const MENSAJE = 'Revisa los datos marcados, la regla no se guardó.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function objeto(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

function texto(valor: unknown) {
  if (typeof valor === 'number') return String(valor);
  return typeof valor === 'string' ? valor.trim() : '';
}

function uno<T extends string>(valor: string, permitidos: readonly T[]) {
  return (permitidos as readonly string[]).includes(valor)
    ? (valor as T)
    : null;
}

// Un día real del calendario: 2026-02-30 no pasa.
function esDia(valor: string) {
  if (!DIA.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

/** La respuesta indica cada campo con problema, con la clave del campo enviado. */
export function errorDeCampos(errores: Record<string, string>) {
  return new BadRequestException({ mensaje: MENSAJE, errores });
}

/**
 * CA1 a CA5 y CA7: valida una regla para crearla o editar su borrador. Una
 * regla incompleta no se guarda, ni siquiera como borrador (CA3), salvo las
 * de tipo Otro, que no tienen cálculo.
 */
export function validarRegla(cuerpo: unknown): DatosRegla {
  const datos = objeto(cuerpo);
  const errores: Record<string, string> = {};

  const nombre = texto(datos.nombre).replace(/\s+/g, ' ');
  if (!nombre) errores.nombre = 'Ingresa el nombre de la regla.';
  else if (nombre.length > LARGO_MAXIMO_NOMBRE)
    errores.nombre = `Usa como máximo ${LARGO_MAXIMO_NOMBRE} caracteres.`;

  const tipo = uno(texto(datos.tipo_regla), TIPOS);
  if (!tipo) errores.tipo_regla = 'Elige el tipo de regla.';
  const de = tipo ?? 'OTRO';
  const calcula = de !== 'OTRO';
  const cuentaVencidos = de === 'FECHA_LIMITE' || de === 'PLAZO_PROTOCOLO';

  // Las reglas de vencimientos siempre son por caso (CA3).
  const ambitoPedido =
    texto(datos.codigo_ambito) || (cuentaVencidos ? 'CASO' : '');
  const codigo_ambito = uno(ambitoPedido, AMBITOS_DEL_TIPO[de]);
  if (!codigo_ambito)
    errores.codigo_ambito = cuentaVencidos
      ? 'Esta regla se calcula por caso.'
      : 'Elige si la regla cuenta por estudiante, curso o toda la escuela.';

  const codigo_accion = uno(texto(datos.codigo_accion), ACCIONES);
  if (!codigo_accion)
    errores.codigo_accion = 'Elige qué hace la regla al cumplirse.';
  const codigo_prioridad = uno(texto(datos.codigo_prioridad), PRIORIDADES);
  if (!codigo_prioridad) errores.codigo_prioridad = 'Elige la prioridad.';

  const operadorTexto = texto(datos.codigo_operador);
  const codigo_operador = operadorTexto
    ? uno(operadorTexto, OPERADORES_DEL_TIPO[de])
    : null;
  if ((calcula && !codigo_operador) || (operadorTexto && !codigo_operador))
    errores.codigo_operador = 'Elige cómo se compara con la cantidad.';

  // CA3 y CA4: la cantidad es un entero (positivo en recurrencia) y la
  // variación es un porcentaje, que puede ser negativo para una baja.
  const umbralTexto = texto(datos.valor_umbral).replace(',', '.');
  let valor_umbral: number | null = null;
  if (umbralTexto) {
    const numero = Number(umbralTexto);
    const entero = de !== 'VARIACION_PERIODO' && de !== 'OTRO';
    const minimo =
      de === 'RECURRENCIA' ? 1 : de === 'VARIACION_PERIODO' ? -100 : 0;
    if (
      !/^-?\d+(\.\d{1,2})?$/.test(umbralTexto) ||
      (entero && !Number.isInteger(numero)) ||
      numero < minimo ||
      numero > UMBRAL_MAXIMO
    )
      errores.valor_umbral =
        de === 'VARIACION_PERIODO'
          ? 'Escribe un porcentaje entre -100 y 100000.'
          : de === 'RECURRENCIA'
            ? 'Escribe una cantidad entera mayor que cero.'
            : 'Escribe una cantidad entera de cero o más.';
    else valor_umbral = numero;
  } else if (calcula)
    errores.valor_umbral =
      de === 'VARIACION_PERIODO'
        ? 'Escribe el porcentaje de variación.'
        : 'Escribe la cantidad.';

  // CA3 y CA4: recurrencia y variación cuentan dentro de una ventana de días.
  const usaVentana = de === 'RECURRENCIA' || de === 'VARIACION_PERIODO';
  const ventanaTexto = texto(datos.ventana_dias);
  let ventana_dias: number | null = null;
  if (ventanaTexto && !cuentaVencidos) {
    const numero = Number(ventanaTexto);
    if (
      !/^\d+$/.test(ventanaTexto) ||
      numero < (usaVentana ? 1 : 0) ||
      numero > VENTANA_MAXIMA_DIAS
    )
      errores.ventana_dias = `Escribe una cantidad de días entre 1 y ${VENTANA_MAXIMA_DIAS}.`;
    else ventana_dias = numero;
  } else if (usaVentana) errores.ventana_dias = 'Escribe la cantidad de días.';

  // CA5: una categoría de la escuela o todas (vacío). Las reglas de
  // vencimientos no usan categoría (CA3).
  const categoriaTexto = texto(datos.categoria_id).toLowerCase();
  let categoria_id: string | null = null;
  if (categoriaTexto) {
    if (cuentaVencidos)
      errores.categoria_id =
        'Esta regla cuenta vencimientos y no usa categoría.';
    else if (!UUID.test(categoriaTexto))
      errores.categoria_id = 'Elige una categoría de la lista.';
    else categoria_id = categoriaTexto;
  }

  const desde = texto(datos.vigente_desde);
  const hasta = texto(datos.vigente_hasta);
  if (desde && !esDia(desde))
    errores.vigente_desde = 'Escribe una fecha válida.';
  if (hasta && !esDia(hasta))
    errores.vigente_hasta = 'Escribe una fecha válida.';
  if (
    desde &&
    hasta &&
    !errores.vigente_desde &&
    !errores.vigente_hasta &&
    hasta < desde
  )
    errores.vigente_hasta = 'El término no puede ser anterior al inicio.';

  if (Object.keys(errores).length > 0) throw errorDeCampos(errores);
  return {
    nombre,
    tipo_regla: de,
    codigo_metrica: METRICA_DEL_TIPO[de],
    codigo_operador,
    valor_umbral,
    ventana_dias,
    // CA4: los dos períodos que se comparan duran lo mismo.
    ventana_comparacion_dias: de === 'VARIACION_PERIODO' ? ventana_dias : null,
    categoria_id,
    codigo_ambito: codigo_ambito as Ambito,
    codigo_accion: codigo_accion as string,
    codigo_prioridad: codigo_prioridad as string,
    vigente_desde: desde || null,
    vigente_hasta: hasta || null,
  };
}
