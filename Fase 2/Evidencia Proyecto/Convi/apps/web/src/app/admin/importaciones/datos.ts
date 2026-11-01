import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { pedirAdmin } from "../datos";
import type { EstadoFila, TipoImportacion } from "./opciones";

// PB-019, PB-020, PB-026 y PB-027 (HU-015 y HU-020), y PB-024 y PB-025
// (HU-019): importaciones del portal de administración. Se piden a la API desde el servidor de Next con el token
// de la sesión; la API vuelve a comprobar el perfil ADMIN, el segundo factor y
// la escuela.

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Mismas formas que devuelve importaciones.service.ts.
export type Importacion = {
  id: string;
  tipo_importacion: TipoImportacion;
  /** CARGADO, PROCESANDO, REVISION, CONFIRMADO, FALLIDO o CANCELADO. */
  estado: string;
  archivo_nombre: string;
  archivo_bytes: number;
  /** Fecha y hora ISO. */
  creado_en: string;
  creado_por: string;
  /** Fecha y hora ISO; null mientras no esté Confirmada. */
  confirmado_en: string | null;
  filas: number;
};

export type Problema = {
  /** Clave del campo; null si es de la fila completa. */
  campo: string | null;
  nivel: "ERROR" | "ADVERTENCIA";
  mensaje: string;
};

export type FilaImportacion = {
  numero_fila: number;
  estado: EstadoFila;
  datos_originales: Record<string, string>;
  /** null mientras la fila no se haya revisado. */
  datos_normalizados: Record<string, string | boolean | null> | null;
  problemas: Problema[] | null;
  /** Lo que creó o reutilizó la fila al confirmarla (HU-020 CA1). */
  entidades_confirmadas: Record<
    string,
    { id: string; accion: "CREADO" | "REUTILIZADO" }
  >;
  /** PB-024 (HU-019 CA2): lo corregido por campo; null si no se corrigió. */
  correccion: {
    valores: Record<string, string>;
    /** Nombre de quien corrigió. */
    por: string;
    /** Fecha y hora ISO. */
    en: string;
  } | null;
};

/** PB-025 (HU-019 CA4): la última cancelación, según la auditoría. */
export type Cancelacion = {
  motivo: string;
  por: string;
  /** Fecha y hora ISO. */
  en: string;
  /** El estado al que vuelve si se restaura. */
  estado_anterior: string;
};

export type CampoImportacion = {
  clave: string;
  titulo: string;
  obligatorio: boolean;
  descripcion: string;
  /** Admite varias columnas, que se juntan (como los dos apellidos). */
  unir: boolean;
};

export type DetalleImportacion = Importacion & {
  columnas: string[];
  /** Los campos de CONVI del tipo, en el orden de la plantilla. */
  campos: CampoImportacion[];
  /** Si pide el año siempre, solo cuando se relaciona Curso, o nunca. */
  uso_del_anio: "SIEMPRE" | "CON_CURSO" | "NUNCA";
  /** Columna → campo: el de la última revisión o el sugerido por los títulos. */
  mapeo: Record<string, string>;
  opciones: {
    anio_academico_id: string | null;
    formato_fecha: string;
    duplicados: string;
  };
  /** Años Planificados y Activos, para elegir al revisar. */
  anios: { id: string; anio: number; estado: string }[];
  /** Cantidad de filas por estado. */
  resumen: Record<EstadoFila, number>;
  pagina: {
    estado: EstadoFila | null;
    numero: number;
    /** Filas con el estado filtrado (o todas). */
    filas: number;
    paginas: number;
  };
  /** Las filas de la página (50), con sus datos originales y su revisión. */
  muestra: FilaImportacion[];
  /** La confirmación en curso o la última; null si nunca se confirmó. */
  confirmacion: EstadoConfirmacion | null;
  /** PB-025: quién la canceló, cuándo y por qué; null si no está Cancelada. */
  cancelacion: Cancelacion | null;
};

/** Lo que se envía para revisar las filas (HU-015 CA3). */
export type NuevaRevision = {
  mapeo: Record<string, string>;
  anio_academico_id: string | null;
  formato_fecha: string;
  duplicados: string;
};

export type Resultado =
  | { ok: true; id: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

/** Cuántas filas se confirmaron y cuántas no (PB-026). */
export type ResultadoConfirmacion = {
  confirmadas: number;
  con_error: number;
  /** Profesores que quedaron sin invitar por el límite de correos. */
  sin_enviar: number;
};

/** PB-027 (HU-020 CA5): la confirmación en segundo plano. */
export type EstadoConfirmacion = {
  incluir_advertencias: boolean;
  /** Filas que entraron a la confirmación. */
  total: number;
  /** Las ya procesadas (confirmadas o con error). */
  procesadas: number;
  /** Fecha y hora ISO. */
  iniciada_en: string;
  /** Fecha y hora ISO; null mientras se confirma. */
  terminada_en: string | null;
  resultado: ResultadoConfirmacion | null;
  /** Hay un trabajo en la cola para esta importación. */
  en_curso: boolean;
};

/** Lo que la pantalla consulta mientras la importación está Procesando. */
export type AvanceImportacion = {
  estado: string;
  resumen: Record<EstadoFila, number>;
  confirmacion: EstadoConfirmacion | null;
};

type Respuesta =
  | { ok: true; datos: Record<string, unknown> }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos cargar el archivo. Inténtalo de nuevo en unos minutos.";
const SIN_REVISION =
  "No pudimos revisar las filas. Inténtalo de nuevo en unos minutos.";
const SIN_CONFIRMACION =
  "No pudimos iniciar la confirmación. Inténtalo de nuevo en unos minutos.";
const SIN_REANUDACION =
  "No pudimos reanudar la confirmación. Inténtalo de nuevo en unos minutos.";
const SIN_OMISION =
  "No pudimos omitir las filas. Inténtalo de nuevo en unos minutos.";
const SIN_CORRECCION =
  "No pudimos guardar la corrección. Inténtalo de nuevo en unos minutos.";
const SIN_CANCELACION =
  "No pudimos cancelar la importación. Inténtalo de nuevo en unos minutos.";
const SIN_RESTAURACION =
  "No pudimos restaurar la importación. Inténtalo de nuevo en unos minutos.";

async function tokenDeSesion() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Sin sesión no se llama a la API. La API igual verifica el token en cada petición.
  if (!token) redirect("/login");
  return token;
}

// Lecturas: 400 y 404 se devuelven como null (un id que no es de la escuela no
// aparece); cualquier otro error lo muestra error.tsx con su botón de reintentar.
async function pedir<T>(ruta: string): Promise<T | null> {
  const respuesta = await pedirAdmin(ruta);
  if (respuesta.status === 400 || respuesta.status === 404) return null;
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return (await respuesta.json()) as T;
}

/** Las importaciones de la escuela, la más reciente primero. */
export async function obtenerImportaciones() {
  const importaciones = await pedir<Importacion[]>("/admin/importaciones");
  return importaciones ?? [];
}

/**
 * La importación con sus columnas, su revisión y una página de 50 filas,
 * opcionalmente solo las de un estado; o null.
 */
export function obtenerImportacion(
  id: string,
  filtro: { estado?: EstadoFila | null; pagina?: number } = {},
) {
  const consulta = new URLSearchParams();
  if (filtro.estado) consulta.set("estado", filtro.estado);
  if (filtro.pagina && filtro.pagina > 1)
    consulta.set("pagina", String(filtro.pagina));
  const texto = consulta.toString();
  return pedir<DetalleImportacion>(
    `/admin/importaciones/${encodeURIComponent(id)}${texto ? `?${texto}` : ""}`,
  );
}

/** PB-020: la plantilla XLSX de un tipo, tal como la entrega la API. */
export async function pedirPlantilla(tipo: string) {
  const respuesta = await pedirAdmin(
    `/admin/importaciones/plantillas/${encodeURIComponent(tipo)}`,
    30000,
  );
  return respuesta;
}

/**
 * Envía una acción a la API con JSON. Los errores se devuelven en vez de
 * lanzarse, para mostrarlos en el formulario.
 */
async function enviarAccion(
  ruta: string,
  cuerpo: unknown,
  sinConexion: string,
  segundos: number,
): Promise<Respuesta> {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
      signal: AbortSignal.timeout(segundos * 1000),
    });
  } catch {
    return { ok: false, mensaje: sinConexion };
  }
  if (respuesta.status === 401) redirect("/login");

  const datos = (await respuesta.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (respuesta.ok && datos) return { ok: true, datos };
  if (respuesta.status === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje:
        typeof datos.mensaje === "string"
          ? datos.mensaje
          : "Revisa los datos marcados.",
      errores: datos.errores as Record<string, string>,
    };
  }
  // 403, 404, 409 (por ejemplo, otra persona cambió la importación al mismo
  // tiempo) y 503 (la cola no responde): la API explica qué pasó.
  if (
    [403, 404, 409, 503].includes(respuesta.status) &&
    typeof datos?.message === "string"
  ) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: sinConexion };
}

/**
 * PB-020 (HU-015 CA3 y CA4): guarda qué campo trae cada columna y las
 * opciones, y la API revisa todas las filas.
 */
export async function enviarRevision(
  id: string,
  revision: NuevaRevision,
): Promise<Resultado> {
  const resultado = await enviarAccion(
    `/admin/importaciones/${encodeURIComponent(id)}/revision`,
    revision,
    SIN_REVISION,
    60,
  );
  return resultado.ok ? { ok: true, id } : resultado;
}

/**
 * PB-026 y PB-027 (HU-020): pide confirmar las filas Válidas y, si se pide,
 * las Con advertencia. La API las revisa de nuevo y deja la confirmación en
 * la cola: responde al tiro, aunque el archivo sea grande.
 */
export async function enviarConfirmacion(
  id: string,
  incluirAdvertencias: boolean,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const resultado = await enviarAccion(
    `/admin/importaciones/${encodeURIComponent(id)}/confirmacion`,
    { incluir_advertencias: incluirAdvertencias },
    SIN_CONFIRMACION,
    60,
  );
  return resultado.ok ? { ok: true } : resultado;
}

/** PB-027: vuelve a encolar una confirmación que se detuvo. */
export async function enviarReanudacion(
  id: string,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const resultado = await enviarAccion(
    `/admin/importaciones/${encodeURIComponent(id)}/reanudacion`,
    {},
    SIN_REANUDACION,
    30,
  );
  return resultado.ok ? { ok: true } : resultado;
}

/**
 * PB-027 (HU-020 CA5): el estado y el avance, sin las filas, tal como los
 * entrega la API. Lo usa la ruta avance/route.ts que consulta la pantalla.
 */
export function pedirAvance(id: string) {
  return pedirAdmin(`/admin/importaciones/${encodeURIComponent(id)}/avance`);
}

/** PB-026 (HU-020 CA5): marca Omitidas las filas Con error. */
export async function enviarOmision(
  id: string,
): Promise<{ ok: true; estado: string } | { ok: false; mensaje: string }> {
  const resultado = await enviarAccion(
    `/admin/importaciones/${encodeURIComponent(id)}/omision`,
    {},
    SIN_OMISION,
    60,
  );
  return resultado.ok
    ? { ok: true, estado: String(resultado.datos.estado) }
    : resultado;
}

/**
 * PB-024 (HU-019 CA2 y CA3): guarda lo corregido en una fila (sin valores, la
 * fila vuelve a los del archivo) y la API revisa de nuevo las filas abiertas.
 */
export async function enviarCorreccion(
  id: string,
  numero: number,
  valores: Record<string, string>,
): Promise<Resultado> {
  const resultado = await enviarAccion(
    `/admin/importaciones/${encodeURIComponent(id)}/filas/${numero}/correccion`,
    { valores },
    SIN_CORRECCION,
    60,
  );
  return resultado.ok ? { ok: true, id } : resultado;
}

/** PB-024 (HU-019 CA3): revisa de nuevo las filas abiertas. */
export async function enviarRevalidacion(id: string): Promise<Resultado> {
  const resultado = await enviarAccion(
    `/admin/importaciones/${encodeURIComponent(id)}/revalidacion`,
    {},
    SIN_REVISION,
    60,
  );
  return resultado.ok ? { ok: true, id } : resultado;
}

/** PB-025 (HU-019 CA4 y CA6): cancela la importación con su motivo. */
export async function enviarCancelacion(
  id: string,
  motivo: string,
): Promise<Resultado> {
  const resultado = await enviarAccion(
    `/admin/importaciones/${encodeURIComponent(id)}/cancelacion`,
    { motivo },
    SIN_CANCELACION,
    30,
  );
  return resultado.ok ? { ok: true, id } : resultado;
}

/** PB-025 (HU-019 CA5): la restaura a su estado anterior, con su motivo. */
export async function enviarRestauracion(
  id: string,
  motivo: string,
): Promise<Resultado> {
  const resultado = await enviarAccion(
    `/admin/importaciones/${encodeURIComponent(id)}/restauracion`,
    { motivo },
    SIN_RESTAURACION,
    30,
  );
  return resultado.ok ? { ok: true, id } : resultado;
}

/**
 * Envía el archivo a la API como multipart, igual que un formulario. Los
 * errores se devuelven en vez de lanzarse, para mostrarlos en el formulario.
 */
export async function enviarArchivo(
  tipo: string,
  archivo: File,
): Promise<Resultado> {
  const token = await tokenDeSesion();
  const cuerpo = new FormData();
  cuerpo.set("tipo", tipo);
  cuerpo.set("archivo", archivo, archivo.name);
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}/admin/importaciones`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: cuerpo,
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    return { ok: false, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) redirect("/login");

  const datos = (await respuesta.json().catch(() => null)) as {
    id?: string;
    mensaje?: string;
    message?: string;
    errores?: Record<string, string>;
  } | null;
  if (respuesta.ok && datos?.id) return { ok: true, id: datos.id };
  // HU-015: la API indica cada campo con problema y no guarda nada.
  if (respuesta.status === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
    };
  }
  // 413: el archivo superó el límite antes de que la API lo leyera.
  if (respuesta.status === 413) {
    return {
      ok: false,
      mensaje: "Revisa los datos marcados.",
      errores: { archivo: "El archivo pesa más de 5 MB." },
    };
  }
  // 403 y 503 (Storage no disponible): la API explica qué pasó.
  if ([403, 503].includes(respuesta.status) && datos?.message) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: SIN_CONEXION };
}