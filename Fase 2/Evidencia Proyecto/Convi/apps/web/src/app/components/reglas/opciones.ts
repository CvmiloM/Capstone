// PB-089 (HU-078): valores y textos de las reglas de aviso, compartidos por el
// formulario (cliente) y las pantallas (servidor). Los mismos valores que
// valida apps/api/src/modules/reglas/regla.ts.

export type Tipo =
  | "RECURRENCIA"
  | "FECHA_LIMITE"
  | "PLAZO_PROTOCOLO"
  | "VARIACION_PERIODO"
  | "OTRO";
export type Ambito = "ESTUDIANTE" | "CURSO" | "CASO" | "ESTABLECIMIENTO";
export type EstadoRegla = "BORRADOR" | "ACTIVO" | "ARCHIVADO";

export const LARGO_MAXIMO_NOMBRE = 180;
export const VENTANA_MAXIMA_DIAS = 3650;

export const TIPOS: { valor: Tipo; texto: string; ayuda: string }[] = [
  {
    valor: "RECURRENCIA",
    texto: "Recurrencia",
    ayuda: "Avisa cuando se juntan varias situaciones en pocos días.",
  },
  {
    valor: "VARIACION_PERIODO",
    texto: "Variación entre períodos",
    ayuda: "Compara dos períodos seguidos de igual duración y avisa si las situaciones suben o bajan.",
  },
  {
    valor: "FECHA_LIMITE",
    texto: "Fecha límite",
    ayuda: "Avisa cuando un caso pasa su fecha límite de cierre.",
  },
  {
    valor: "PLAZO_PROTOCOLO",
    texto: "Plazo de protocolo",
    ayuda: "Avisa cuando vencen pasos del protocolo aplicado a un caso.",
  },
  {
    valor: "OTRO",
    texto: "Otro",
    ayuda: "Sirve para dejar anotada una idea de regla, se guarda como borrador pero no se activa porque no tiene cálculo.",
  },
];

export const NOMBRE_TIPO = Object.fromEntries(
  TIPOS.map((t) => [t.valor, t.texto]),
) as Record<Tipo, string>;

export const NOMBRE_AMBITO: Record<Ambito, string> = {
  ESTUDIANTE: "Por estudiante",
  CURSO: "Por curso",
  CASO: "Por caso",
  ESTABLECIMIENTO: "Toda la escuela",
};

export const AMBITOS_DEL_TIPO: Record<Tipo, Ambito[]> = {
  RECURRENCIA: ["ESTUDIANTE", "CURSO", "ESTABLECIMIENTO"],
  VARIACION_PERIODO: ["ESTUDIANTE", "CURSO", "ESTABLECIMIENTO"],
  FECHA_LIMITE: ["CASO"],
  PLAZO_PROTOCOLO: ["CASO"],
  OTRO: ["ESTUDIANTE", "CURSO", "CASO", "ESTABLECIMIENTO"],
};

export const NOMBRE_OPERADOR: Record<string, string> = {
  GE: "Al menos",
  GT: "Más de",
  LE: "Como máximo",
  LT: "Menos de",
  EQ: "Exactamente",
};

export const OPERADORES_DEL_TIPO: Record<Tipo, string[]> = {
  RECURRENCIA: ["GE", "GT", "EQ", "LE", "LT"],
  VARIACION_PERIODO: ["GE", "GT", "LE", "LT"],
  FECHA_LIMITE: ["GE", "GT", "EQ", "LE", "LT"],
  PLAZO_PROTOCOLO: ["GE", "GT", "EQ", "LE", "LT"],
  OTRO: ["GE", "GT", "EQ", "LE", "LT"],
};

export const NOMBRE_ACCION: Record<string, string> = {
  ALERTA: "Solo registrar la alerta",
  ALERTA_Y_NOTIFICACION: "Registrar la alerta y avisar a Convivencia",
};

export const NOMBRE_PRIORIDAD: Record<string, string> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

export const NOMBRE_ESTADO: Record<EstadoRegla, string> = {
  BORRADOR: "Borrador",
  ACTIVO: "Activa",
  ARCHIVADO: "Archivada",
};

/** Clases del distintivo de cada estado, con los colores de globals.css. */
export const CLASE_ESTADO: Record<EstadoRegla, string> = {
  ACTIVO: "bg-verde/15 text-tinta",
  BORRADOR: "bg-amarillo/25 text-tinta",
  ARCHIVADO: "bg-muted text-muted-foreground",
};

export const usaVentana = (tipo: Tipo) =>
  tipo === "RECURRENCIA" || tipo === "VARIACION_PERIODO";
export const cuentaVencidos = (tipo: Tipo) =>
  tipo === "FECHA_LIMITE" || tipo === "PLAZO_PROTOCOLO";

const DONDE: Record<Ambito, string> = {
  ESTUDIANTE: "del mismo estudiante",
  CURSO: "del mismo curso",
  CASO: "del mismo caso",
  ESTABLECIMIENTO: "en toda la escuela",
};

function plural(cantidad: number, uno: string, varios: string) {
  return cantidad === 1 ? uno : varios;
}

/**
 * La regla en una frase, para la lista, el detalle y la vista previa del
 * formulario: «Al menos 3 situaciones de Agresión física del mismo
 * estudiante en 30 días».
 */
export function describirRegla(regla: {
  tipo_regla: Tipo;
  codigo_ambito: Ambito;
  codigo_operador: string | null;
  valor_umbral: number | null;
  ventana_dias: number | null;
  categoria?: string | null;
}): string {
  const operador = regla.codigo_operador ? NOMBRE_OPERADOR[regla.codigo_operador] : null;
  const n = regla.valor_umbral;
  if (regla.tipo_regla === "OTRO" || !operador || n === null)
    return regla.tipo_regla === "OTRO"
      ? "Regla sin cálculo definido, se guarda como borrador y no se activa"
      : "Falta completar la condición de la regla";
  const de = regla.categoria ? ` de ${regla.categoria}` : "";
  const dias = regla.ventana_dias ?? 0;
  switch (regla.tipo_regla) {
    case "RECURRENCIA":
      return `${operador} ${n} ${plural(n, "situación", "situaciones")}${de} ${DONDE[regla.codigo_ambito]} en ${dias} ${plural(dias, "día", "días")}`;
    case "VARIACION_PERIODO":
      return `Variación de ${operador.toLowerCase()} ${n} % en las situaciones${de} ${DONDE[regla.codigo_ambito]}, comparando dos períodos seguidos de ${dias} ${plural(dias, "día", "días")}`;
    case "FECHA_LIMITE":
      return `Casos con ${operador.toLowerCase()} ${n} ${plural(n, "fecha límite de cierre vencida", "fechas límite de cierre vencidas")}`;
    case "PLAZO_PROTOCOLO":
      return `Casos con ${operador.toLowerCase()} ${n} ${plural(n, "paso de protocolo vencido", "pasos de protocolo vencidos")}`;
  }
}

const formatoDia = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** «1 mar 2026» a partir de AAAA-MM-DD, sin correr el día por la zona horaria. */
export function formatearDia(dia: string) {
  return formatoDia.format(new Date(`${dia}T00:00:00Z`));
}

/** Vigencia en palabras: «Desde el 1 mar 2026», «Del … al …» o «Sin fecha». */
export function describirVigencia(desde: string | null, hasta: string | null) {
  if (desde && hasta) return `Del ${formatearDia(desde)} al ${formatearDia(hasta)}`;
  if (desde) return `Desde el ${formatearDia(desde)}`;
  if (hasta) return `Hasta el ${formatearDia(hasta)}`;
  return "Empieza el día en que se activa";
}
