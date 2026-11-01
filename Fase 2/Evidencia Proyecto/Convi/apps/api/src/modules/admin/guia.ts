import { BadRequestException } from '@nestjs/common';
import { validarDatosAnio } from '../academico/anio-academico.js';
import { claveDeCurso } from '../importaciones/valores.js';

// PB-032 (HU-025) y PB-038 (HU-031): guía inicial del administrador. El avance
// se guarda en establecimientos.contexto_onboarding (HU-031 CA2) y la respuesta
// de la bienvenida en establecimientos.metodo_registro_actual (HU-025 CA3).
// Omitir un paso solo deja constancia de que se omitió: no crea registros, no
// envía invitaciones y no cuenta como listo (HU-031 CA3).

/** Pasos en orden (por defecto). Los pasos 2 a 6 se activan en cada ítem. */
export const PASOS_GUIA = [
  'bienvenida',
  'equipo',
  'cursos',
  'reglamento',
  'estudiantes',
  'reglas',
  'fin',
] as const;
export type PasoGuia = (typeof PASOS_GUIA)[number];

/** Pasos que por ahora se hacen en el portal y en la guía solo se omiten. */
export const PASOS_OMITIBLES: readonly PasoGuia[] = [
  'equipo',
  'cursos',
  'reglamento',
  'estudiantes',
  'reglas',
];

export const METODOS_REGISTRO = [
  'LIBRO_CLASES',
  'PLANILLAS',
  'DOCUMENTOS',
  'OTRO_SISTEMA',
  'SIN_REGISTRO',
  'OTRO',
] as const;

// Decisión del PO (por defecto).
export const LARGO_MAXIMO_OTRO_METODO = 200;
export const LARGO_MAXIMO_MEJORAR = 500;

/** Huella del avance que se veía (md5), para PB-139. */
const VERSION = /^[0-9a-f]{32}$/;
const RECARGAR = 'Recarga la página e inténtalo nuevamente.';

export type EstadoPaso = 'PENDIENTE' | 'LISTO' | 'OMITIDO';

export type Bienvenida =
  | { accion: 'OMITIR'; version: string }
  | {
      accion: 'GUARDAR';
      metodo: (typeof METODOS_REGISTRO)[number];
      otro: string | null;
      mejorar: string | null;
      version: string;
    };

function datosDe(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function version(datos: Record<string, unknown>) {
  return typeof datos.version === 'string' && VERSION.test(datos.version)
    ? datos.version
    : null;
}

function rechazar(mensaje: string, errores: Record<string, string>): never {
  throw new BadRequestException({ mensaje, errores });
}

export function pasoDe(valor: unknown): PasoGuia | null {
  return PASOS_GUIA.find((p) => p === valor) ?? null;
}

// HU-025 CA3 y CA4: la respuesta es opcional. Guardar exige elegir una
// opción (y explicarla si es Otro); omitir no guarda ninguna respuesta.
export function validarBienvenida(cuerpo: unknown): Bienvenida {
  const datos = datosDe(cuerpo);
  const vista = version(datos);
  if (datos.accion === 'OMITIR') {
    if (!vista) rechazar('La bienvenida no cambió.', { accion: RECARGAR });
    return { accion: 'OMITIR', version: vista };
  }
  const errores: Record<string, string> = {};
  if (datos.accion !== 'GUARDAR')
    errores.accion = 'Elige si guardas la respuesta u omites el paso.';
  const metodo = METODOS_REGISTRO.find((m) => m === datos.metodo);
  if (!metodo)
    errores.metodo =
      'Elige una opción, o usa «Omitir este paso» si prefieres no responder.';
  const otro = texto(datos.otro);
  if (metodo === 'OTRO' && !otro)
    errores.otro = 'Cuéntanos brevemente cómo lo registraban.';
  else if (otro.length > LARGO_MAXIMO_OTRO_METODO)
    errores.otro = `El texto admite hasta ${LARGO_MAXIMO_OTRO_METODO} caracteres.`;
  const mejorar = texto(datos.mejorar);
  if (mejorar.length > LARGO_MAXIMO_MEJORAR)
    errores.mejorar = `El texto admite hasta ${LARGO_MAXIMO_MEJORAR} caracteres.`;
  if (!vista) errores.accion = RECARGAR;
  if (!metodo || !vista || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. La bienvenida no cambió.', errores);
  return {
    accion: 'GUARDAR',
    metodo,
    otro: metodo === 'OTRO' ? otro : null,
    mejorar: mejorar || null,
    version: vista,
  };
}

/** Omitir un paso o empezar la guía solo necesita la huella que se veía. */
export function validarVersion(cuerpo: unknown): string {
  const vista = version(datosDe(cuerpo));
  if (!vista) rechazar('La guía no cambió.', { version: RECARGAR });
  return vista;
}

type PasoGuardado = { estado?: unknown; en?: unknown; por?: unknown };

export type AvanceGuia = {
  iniciada: boolean;
  pasos: {
    clave: PasoGuia;
    estado: EstadoPaso;
    en: string | null;
    /** Membresía de quien lo marcó; el servicio la cambia por su nombre. */
    por: string | null;
  }[];
  /** HU-031 CA2: el primer paso pendiente, o el final si no queda ninguno. */
  paso_actual: PasoGuia;
  bienvenida: { otro: string | null; mejorar: string | null };
};

/**
 * Lee el avance guardado en contexto_onboarding. Es JSON de la escuela, así
 * que se lee con cuidado: lo que no tenga la forma esperada cuenta como
 * pendiente.
 */
export function leerAvance(contexto: unknown): AvanceGuia {
  const c = datosDe(contexto);
  const guardados = datosDe(c.pasos) as Record<string, PasoGuardado>;
  const pasos = PASOS_GUIA.map((clave) => {
    const p = datosDe(guardados[clave]) as PasoGuardado;
    const estado: EstadoPaso =
      p.estado === 'LISTO' || p.estado === 'OMITIDO' ? p.estado : 'PENDIENTE';
    return {
      clave,
      estado,
      en: estado !== 'PENDIENTE' && typeof p.en === 'string' ? p.en : null,
      por: estado !== 'PENDIENTE' && typeof p.por === 'string' ? p.por : null,
    };
  });
  const bienvenida = datosDe(c.bienvenida);
  return {
    iniciada: typeof c.iniciada_en === 'string',
    pasos,
    paso_actual:
      pasos.find((p) => p.clave !== 'fin' && p.estado === 'PENDIENTE')?.clave ??
      'fin',
    bienvenida: {
      otro: typeof bienvenida.otro === 'string' ? bienvenida.otro : null,
      mejorar:
        typeof bienvenida.mejorar === 'string' ? bienvenida.mejorar : null,
    },
  };
}

// ===== PB-034 (HU-027): año, niveles y cursos desde la guía =====

/**
 * Niveles que propone la guía (por defecto: Básica de 1° a 8° y Media de 1°
 * a 4°; Parvularia queda para el portal). El tramo sale de la lista cerrada
 * de nivel-educativo.ts. El navegador solo envía la clave; el nombre, el
 * ciclo y el tramo los pone el servidor.
 */
export const NIVELES_GUIA = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    clave: `BASICA-${n}`,
    nombre: `${n}° básico`,
    ciclo: 'BASICA' as const,
    tramo: n <= 4 ? 'PRIMER_CICLO' : 'SEGUNDO_CICLO',
  })),
  ...[1, 2, 3, 4].map((n) => ({
    clave: `MEDIA-${n}`,
    nombre: `${n}° medio`,
    ciclo: 'MEDIA' as const,
    tramo: n <= 2 ? 'FORMACION_GENERAL' : 'FORMACION_DIFERENCIADA',
  })),
];
export type NivelGuia = (typeof NIVELES_GUIA)[number];

export const SECCIONES_MAXIMAS = 6;

/** Las secciones de un nivel: A, B, C… */
export function secciones(cantidad: number) {
  return Array.from({ length: cantidad }, (_, i) =>
    String.fromCharCode(65 + i),
  );
}

export type CursosGuia = {
  anio: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  activar: boolean;
  niveles: { nivel: NivelGuia; secciones: number }[];
  version: string;
};

// HU-027 CA1: año, enseñanza, niveles y secciones. Las fechas siguen las
// mismas reglas que en Años académicos.
export function validarCursosGuia(cuerpo: unknown): CursosGuia {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  let anio: ReturnType<typeof validarDatosAnio> | null = null;
  try {
    anio = validarDatosAnio(datos);
  } catch (error) {
    const respuesta = (error as BadRequestException).getResponse?.() as
      { errores?: Record<string, string> } | undefined;
    Object.assign(errores, respuesta?.errores ?? { anio: 'Revisa el año.' });
  }
  const elegidos = Array.isArray(datos.niveles) ? datos.niveles : [];
  const niveles: CursosGuia['niveles'] = [];
  for (const elegido of elegidos) {
    const e = datosDe(elegido);
    const nivel = NIVELES_GUIA.find((n) => n.clave === e.clave);
    const cantidad = Number(e.secciones);
    if (
      !nivel ||
      niveles.some((x) => x.nivel.clave === nivel.clave) ||
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > SECCIONES_MAXIMAS
    ) {
      errores.niveles = `Revisa los niveles: cada uno una vez, con 1 a ${SECCIONES_MAXIMAS} secciones.`;
      break;
    }
    niveles.push({ nivel, secciones: cantidad });
  }
  if (niveles.length === 0 && !errores.niveles)
    errores.niveles = 'Elige al menos un nivel.';
  const vista = version(datos);
  if (!vista) errores.anio = RECARGAR;
  if (!anio || !vista || Object.keys(errores).length > 0)
    rechazar('Revisa los datos marcados. No se creó nada.', errores);
  return {
    ...anio,
    activar: datos.activar === true || datos.activar === 'true',
    niveles,
    version: vista,
  };
}

/**
 * CA3: el mismo nivel puede estar escrito distinto en la escuela, como
 * «I medio» o «1° Medio». Se compara igual que los cursos de una importación
 * (PB-036): sin tildes, sin «°» ni puntos y con los números romanos del inicio
 * cambiados por cifras.
 */
export function mismoNivel(a: string, b: string) {
  return claveDeCurso(a) === claveDeCurso(b);
}
