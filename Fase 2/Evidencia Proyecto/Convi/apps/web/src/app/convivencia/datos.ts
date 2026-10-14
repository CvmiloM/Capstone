import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// Datos del portal de Convivencia (PB-044). Se piden a la API desde el
// servidor de Next con el token de la sesión; la API exige el perfil
// CONVIVENCIA con segundo factor en cada petición (PB-127 y PB-009).

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001, igual que la URL de Supabase.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Mismas formas que devuelve apps/api/src/modules/situaciones/convivencia.service.ts.
// Las fechas llegan como texto ISO porque viajan en JSON.
export type SituacionBandeja = {
  id: string;
  codigo: string;
  ocurrido_en: string;
  reportado_en: string;
  estado: string;
  urgencia: string;
  tipo_origen: string;
  curso: string | null;
  categoria: string | null;
  reportado_por: string;
  estudiantes: number;
  aclaraciones_pendientes: number;
};

export type Bandeja = {
  situaciones: SituacionBandeja[];
  conteo: { estado: string; urgencia: string; total: number }[];
  limite: number;
};

export type DetalleConvivencia = SituacionBandeja & {
  lugar: string | null;
  descripcion: string;
  participantes: {
    nombres: string;
    apellidos: string;
    codigo_estudiante: string | null;
    rol: string;
    curso_matricula: string | null;
  }[];
  aclaraciones: {
    id: string;
    pregunta: string;
    solicitado_por: string;
    solicitado_en: string;
    estado: string;
    respuesta: string | null;
    respondido_en: string | null;
  }[];
};

/** "sin-permiso": la API rechazó la petición (403) o el registro no existe o no es válido (400 y 404). */
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

/** HU-037 CA1: filtros opcionales de la bandeja. */
export function obtenerBandeja(filtros: { estado?: string; urgencia?: string }) {
  const parametros = new URLSearchParams();
  if (filtros.estado) parametros.set("estado", filtros.estado);
  if (filtros.urgencia) parametros.set("urgencia", filtros.urgencia);
  const consulta = parametros.toString();
  return pedir<Bandeja>(
    `/convivencia/situaciones${consulta ? `?${consulta}` : ""}`,
  );
}

export function obtenerSituacion(id: string) {
  return pedir<DetalleConvivencia>(
    `/convivencia/situaciones/${encodeURIComponent(id)}`,
  );
}

// --- Acciones sobre una situación ---

export type ResultadoAccion =
  | { ok: true }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos guardar el cambio. Revisa tu conexión e inténtalo nuevamente.";

/**
 * Envía un cambio a la API. Los errores se devuelven en vez de lanzarse, para
 * que el formulario los muestre sin perder lo escrito.
 */
async function enviar(
  metodo: "POST" | "PATCH",
  ruta: string,
  cuerpo?: unknown,
): Promise<ResultadoAccion> {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      cache: "no-store",
    });
  } catch {
    return { ok: false, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) redirect("/login");
  if (respuesta.ok) return { ok: true };

  const datos = (await respuesta.json().catch(() => null)) as {
    mensaje?: string;
    message?: string;
    errores?: Record<string, string>;
  } | null;
  if (respuesta.status === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
    };
  }
  if (respuesta.status === 403) {
    return {
      ok: false,
      mensaje: "No tienes permiso para hacer este cambio.",
    };
  }
  // 404 y 409 traen un mensaje pensado para mostrarse tal cual.
  if ((respuesta.status === 404 || respuesta.status === 409) && datos?.message) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: SIN_CONEXION };
}

/** HU-037 CA2: una situación Nueva pasa a En revisión. */
export function enviarInicioRevision(id: string) {
  return enviar(
    "POST",
    `/convivencia/situaciones/${encodeURIComponent(id)}/revision`,
  );
}

/** HU-037 CA3: cambio de urgencia con motivo. */
export function enviarCambioUrgencia(
  id: string,
  cambio: { urgencia: string; urgencia_anterior: string; motivo: string },
) {
  return enviar(
    "PATCH",
    `/convivencia/situaciones/${encodeURIComponent(id)}/urgencia`,
    cambio,
  );
}

/** HU-037 CA1: estados de la situación con el nombre que usa Convivencia. */
export const ESTADOS = [
  { valor: "NUEVA", texto: "Nueva" },
  { valor: "EN_REVISION", texto: "En revisión" },
  { valor: "INFORMACION_SOLICITADA", texto: "Información solicitada" },
  { valor: "ANTECEDENTE", texto: "Antecedente" },
  { valor: "DESCARTADA", texto: "Descartada" },
  { valor: "VINCULADA_CASO", texto: "Vinculada a caso" },
] as const;

export const NOMBRE_ESTADO: Record<string, string> = Object.fromEntries(
  ESTADOS.map((e) => [e.valor, e.texto]),
);

/** Estados en que la situación sigue abierta y su urgencia todavía se ajusta. */
export const ESTADOS_ABIERTOS = ["NUEVA", "EN_REVISION", "INFORMACION_SOLICITADA"];

/** Quién informó la situación (situaciones.tipo_origen). */
export const NOMBRE_ORIGEN: Record<string, string> = {
  PROFESOR: "Profesor",
  ESTUDIANTE: "Estudiante",
  APODERADO: "Apoderado",
  FUNCIONARIO: "Funcionario",
  OTRO: "Otro",
};
