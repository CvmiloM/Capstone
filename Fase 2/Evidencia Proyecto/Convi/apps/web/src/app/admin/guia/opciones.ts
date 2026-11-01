// PB-032, PB-034 y PB-038: textos y constantes de la guía inicial, para el
// servidor y los formularios del navegador. Mismas claves y largos que
// apps/api/src/modules/admin/guia.ts.

export const LARGO_MAXIMO_OTRO_METODO = 200;
export const LARGO_MAXIMO_MEJORAR = 500;
export const SECCIONES_MAXIMAS = 6;

export type ClavePaso =
  | "bienvenida"
  | "equipo"
  | "cursos"
  | "reglamento"
  | "estudiantes"
  | "reglas"
  | "fin";

/**
 * HU-031 CA1: cada paso explica qué se prepara y qué ocurrirá al confirmar.
 * Los pasos que todavía no funcionan dentro de la guía llevan a la sección
 * del portal donde ya se pueden hacer.
 */
export const PASOS: {
  clave: ClavePaso;
  titulo: string;
  prepara: string;
  alConfirmar: string;
  enlaces?: { href: string; texto: string }[];
}[] = [
  {
    clave: "bienvenida",
    titulo: "Bienvenida",
    prepara:
      "Te mostramos qué vas a configurar y te preguntamos cómo registraba tu escuela la convivencia antes de CONVI.",
    alConfirmar:
      "Tu respuesta queda guardada en la ficha de la escuela. Responder es opcional.",
  },
  {
    clave: "equipo",
    titulo: "Equipo",
    prepara:
      "Las cuentas del equipo de Convivencia y de los profesores, con su nombre, apellido, correo y perfil.",
    alConfirmar:
      "CONVI envía una invitación por correo a cada persona. Su cuenta queda pendiente hasta que la acepte.",
  },
  {
    clave: "cursos",
    titulo: "Año, niveles y cursos",
    prepara:
      "El año académico, los niveles de Básica o Media y los cursos de cada nivel con sus secciones.",
    alConfirmar:
      "Se crean el año, los niveles que falten y los cursos, sin repetir lo que ya existe.",
  },
  {
    clave: "reglamento",
    titulo: "Reglamento",
    prepara:
      "El reglamento interno de la escuela (RICE) como documento con su versión.",
    alConfirmar:
      "El archivo original queda guardado y se prepara para las consultas con IA de Convivencia.",
    enlaces: [{ href: "/admin/documentos", texto: "Subir desde Documentos" }],
  },
  {
    clave: "estudiantes",
    titulo: "Estudiantes",
    prepara:
      "La nómina de estudiantes desde un archivo CSV o Excel, usando los cursos ya creados.",
    alConfirmar:
      "Revisas una vista previa fila por fila y solo se guardan las filas válidas que confirmes. Quedan matriculados en el curso que indique la nómina.",
  },
  {
    clave: "reglas",
    titulo: "Categorías y reglas",
    prepara:
      "Las categorías de las situaciones y las reglas que avisan cuando se juntan varias situaciones en pocos días.",
    alConfirmar:
      "Las categorías se usan al registrar situaciones y las reglas activas empiezan a generar alertas.",
    enlaces: [
      { href: "/admin/categorias", texto: "Ir a Categorías" },
      { href: "/admin/reglas", texto: "Ir a Reglas" },
    ],
  },
  {
    clave: "fin",
    titulo: "Resumen y fin",
    prepara:
      "Un resumen de lo configurado y de lo que falta, con las cifras reales de tu escuela.",
    alConfirmar:
      "La guía queda terminada y se abre el portal de administración.",
  },
];

export const NOMBRE_ESTADO_PASO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  LISTO: "Listo",
  OMITIDO: "Omitido",
};

export const CLASE_ESTADO_PASO: Record<string, string> = {
  PENDIENTE: "bg-muted text-muted-foreground",
  LISTO: "bg-verde/15 text-tinta",
  OMITIDO: "bg-amarillo/25 text-tinta",
};

/** HU-025 CA3: cómo registraba la escuela la convivencia antes de CONVI. */
export const METODOS_REGISTRO = [
  { valor: "LIBRO_CLASES", texto: "Libro de clases" },
  { valor: "PLANILLAS", texto: "Planillas Excel" },
  { valor: "DOCUMENTOS", texto: "Documentos de Word o en papel" },
  { valor: "OTRO_SISTEMA", texto: "Otro sistema" },
  { valor: "SIN_REGISTRO", texto: "No había un registro formal" },
  { valor: "OTRO", texto: "Otro" },
] as const;

/** HU-027: niveles que propone la guía, con la misma clave que la API. */
export const NIVELES_GUIA = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    clave: `BASICA-${n}`,
    nombre: `${n}° básico`,
    ciclo: "BASICA" as const,
  })),
  ...[1, 2, 3, 4].map((n) => ({
    clave: `MEDIA-${n}`,
    nombre: `${n}° medio`,
    ciclo: "MEDIA" as const,
  })),
];

export function secciones(cantidad: number) {
  return Array.from({ length: cantidad }, (_, i) =>
    String.fromCharCode(65 + i),
  );
}

/** Fechas en la zona horaria de la escuela, que la API envía con los datos. */
export function formatoFecha(zonaHoraria: string) {
  const formato = new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zonaHoraria,
  });
  return (iso: string) => formato.format(new Date(iso));
}

const ROMANOS: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
};

/**
 * CA3: el mismo nivel puede estar escrito distinto en la escuela, como
 * «I medio» o «1° Medio». Se compara sin tildes, sin «°» ni puntos y con los
 * números romanos del inicio cambiados por cifras.
 */
export function mismoNivel(a: string, b: string) {
  return normalizarNivel(a) === normalizarNivel(b);
}

function normalizarNivel(nombre: string) {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º.]/g, " ")
    .trim()
    .replace(/^(viii|vii|vi|iv|v|iii|ii|i)\b/, (r) => ROMANOS[r])
    .replace(/\s+/g, " ");
}
