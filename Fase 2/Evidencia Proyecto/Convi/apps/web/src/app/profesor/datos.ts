import { redirect } from "next/navigation";
import type { Evidencia } from "@/app/components/evidencias/opciones";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// Datos del portal del profesor (PB-041, PB-042 y PB-049). Se piden a la API desde el servidor
// de Next con el token de la sesión; la API decide qué puede ver el profesor.

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001, igual que la URL de Supabase.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Mismas formas que devuelve apps/api/src/modules/situaciones/profesor.service.ts.
// Las fechas llegan como texto ISO porque viajan en JSON.
export type CursoAsignado = {
  id: string;
  nombre: string;
  nivel: string;
  anio: number;
  roles: string[];
  estudiantes: number;
};

export type EstudianteDelCurso = {
  id: string;
  nombres: string;
  apellidos: string;
  codigo_estudiante: string;
};

/** "sin-permiso": la API rechazó el registro (403) o no existe o no es válido (400 y 404). */
type Respuesta<T> = { ok: true; datos: T } | { ok: false; motivo: "sin-permiso" };

async function tokenDeSesion() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Sin sesión no se llama a la API. La API igual verifica el token en cada petición.
  if (!token) redirect("/login");
  return token;
}

async function pedir<T>(ruta: string): Promise<Respuesta<T>> {
  const token = await tokenDeSesion();
  const respuesta = await fetch(`${URL_API}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (respuesta.status === 401) redirect("/login");
  if ([400, 403, 404].includes(respuesta.status)) {
    return { ok: false, motivo: "sin-permiso" };
  }
  // Cualquier otro error lo muestra error.tsx con su botón de reintentar.
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return { ok: true, datos: (await respuesta.json()) as T };
}

export function obtenerCursos() {
  return pedir<CursoAsignado[]>("/profesor/cursos");
}

export function obtenerEstudiantes(cursoId: string) {
  return pedir<EstudianteDelCurso[]>(
    `/profesor/cursos/${encodeURIComponent(cursoId)}/estudiantes`,
  );
}

/** Nombres legibles de los roles de asignación del modelo. */
export const NOMBRE_ROL: Record<string, string> = {
  PROFESOR_JEFE: "Profesor jefe",
  PROFESOR: "Profesor de asignatura",
};

// --- Registro de situación (PB-042, HU-035) ---

export type Categoria = {
  id: string;
  nombre: string;
};

export function obtenerCategorias() {
  return pedir<Categoria[]>("/profesor/categorias");
}

export type ResultadoRegistro =
  | { ok: true; id: string; codigo: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos registrar la situación. Revisa tu conexión e inténtalo nuevamente; lo que escribiste sigue en el formulario.";

/** Lo que puede responder la API al recibir un formulario. */
type CuerpoEnvio = {
  id?: string;
  codigo?: string;
  mensaje?: string;
  message?: string;
  errores?: Record<string, string>;
};

/**
 * Envía un formulario a la API con el token de la sesión. Devuelve null si no
 * hubo conexión: los errores se devuelven en vez de lanzarse, para que el
 * formulario no pierda lo que escribió el profesor.
 */
async function enviar(
  ruta: string,
  cuerpo: unknown,
): Promise<{ estado: number; datos: CuerpoEnvio | null } | null> {
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
    });
  } catch {
    return null;
  }
  if (respuesta.status === 401) redirect("/login");
  const datos = (await respuesta.json().catch(() => null)) as CuerpoEnvio | null;
  return { estado: respuesta.status, datos };
}

/** Envía la situación a la API, que valida todo de nuevo y la guarda en una sola transacción. */
export async function enviarSituacion(
  cuerpo: unknown,
): Promise<ResultadoRegistro> {
  const envio = await enviar("/profesor/situaciones", cuerpo);
  if (!envio) return { ok: false, mensaje: SIN_CONEXION };
  const { estado, datos } = envio;
  if (estado === 201 && datos?.id && datos.codigo) {
    return { ok: true, id: datos.id, codigo: datos.codigo };
  }
  // HU-035 CA5: la API indica cada campo con problema y no guarda nada.
  if (estado === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
    };
  }
  if (estado === 403) {
    return {
      ok: false,
      mensaje:
        "Ya no tienes una asignación vigente en este curso, así que no puedes registrar situaciones en él.",
    };
  }
  // 409: otra situación se registró al mismo tiempo y la API ya reintentó.
  if (estado === 409 && datos?.message) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: SIN_CONEXION };
}

// --- Respuesta a aclaración (PB-049, HU-042) ---

export type ResultadoRespuesta =
  | { ok: true }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const RESPUESTA_SIN_CONEXION =
  "No pudimos enviar tu respuesta. Revisa tu conexión e inténtalo nuevamente; lo que escribiste sigue en el formulario.";

/** Envía la respuesta del profesor. La API comprueba que la aclaración sea suya y siga pendiente. */
export async function enviarRespuesta(
  aclaracionId: string,
  respuesta: string,
): Promise<ResultadoRespuesta> {
  const envio = await enviar(
    `/profesor/aclaraciones/${encodeURIComponent(aclaracionId)}/respuesta`,
    { respuesta },
  );
  if (!envio) return { ok: false, mensaje: RESPUESTA_SIN_CONEXION };
  const { estado, datos } = envio;
  if (estado === 201) return { ok: true };
  if (estado === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa tu respuesta.",
      errores: datos.errores,
    };
  }
  // HU-042 CA3: solo el profesor destinatario responde.
  if (estado === 400 || estado === 403) {
    return { ok: false, mensaje: "No puedes responder esta aclaración." };
  }
  // 409: ya estaba respondida (por ejemplo, desde otra pestaña).
  if (estado === 409 && datos?.message) {
    return {
      ok: false,
      mensaje: `${datos.message} Recarga la página para verla.`,
    };
  }
  return { ok: false, mensaje: RESPUESTA_SIN_CONEXION };
}



// --- Mis registros (HU-034 CA2) ---

export type SituacionPropia = {
  id: string;
  codigo: string;
  ocurrido_en: string;
  reportado_en: string;
  estado: string;
  urgencia: string;
  curso_id: string | null;
  curso: string | null;
  categoria: string | null;
  aclaraciones_pendientes: number;
};

export type DetalleSituacion = SituacionPropia & {
  lugar: string | null;
  descripcion: string;
  participantes: {
    nombres: string;
    apellidos: string;
    codigo_estudiante: string | null;
    rol: string;
  }[];
  /** PB-066: solo las que aportó el profesor, en la situación o al responder. */
  evidencias: Evidencia[];
  aclaraciones: {
    id: string;
    pregunta: string;
    solicitado_en: string;
    estado: string;
    respuesta: string | null;
    respondido_en: string | null;
  }[];
};

export function obtenerSituaciones() {
  return pedir<SituacionPropia[]>("/profesor/situaciones");
}

export function obtenerSituacion(situacionId: string) {
  return pedir<DetalleSituacion>(
    `/profesor/situaciones/${encodeURIComponent(situacionId)}`,
  );
}

/** Estados de la situación (convi.situaciones.estado) como los lee el profesor. */
export const NOMBRE_ESTADO: Record<string, string> = {
  NUEVA: "Nueva",
  EN_REVISION: "En revisión",
  INFORMACION_SOLICITADA: "Información solicitada",
  ANTECEDENTE: "Guardada como antecedente",
  DESCARTADA: "Descartada",
  VINCULADA_CASO: "En seguimiento por Convivencia",
};

/** Urgencia declarada y su estilo, con los colores con nombre de globals.css. */
export const URGENCIA: Record<string, { texto: string; clase: string }> = {
  NORMAL: { texto: "Normal", clase: "bg-muted text-muted-foreground" },
  URGENTE: { texto: "Urgente", clase: "bg-amarillo/25 text-tinta" },
  INMEDIATA: { texto: "Inmediata", clase: "bg-destructive/10 text-destructive" },
};

// TODO(HU-021): usar la zona horaria de la escuela cuando la API la entregue.
const formatoFecha = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Santiago",
});

/** Fecha y hora legibles a partir del texto ISO que entrega la API. */
export function formatearFecha(iso: string) {
  return formatoFecha.format(new Date(iso));
}
