import { redirect } from "next/navigation";
import type { Evidencia } from "@/app/components/evidencias/opciones";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// Datos del portal de Convivencia (PB-043, PB-044, PB-045, PB-046 y PB-155). Se piden a la API desde el
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
  /** Quién informó, cuando la registró Convivencia por otro canal (HU-036). */
  informante: string | null;
  /** PB-046 (HU-039): membresía y nombre de quien revisa, si ya se asignó. */
  responsable_id: string | null;
  responsable: string | null;
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
    /** PB-074: para abrir su historial; null si no es estudiante. */
    estudiante_id: string | null;
    nombres: string;
    apellidos: string;
    codigo_estudiante: string | null;
    rol: string;
    /** Curso y año el día del hecho; null si no tenía matrícula (HU-066). */
    curso_matricula: string | null;
    /** Curso y año de su matrícula activa hoy (HU-066 CA2). */
    curso_actual: string | null;
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
  /** PB-046 (HU-039 CA1): cuentas de Convivencia activas que pueden revisar. */
  opciones_responsable: { id: string; nombre: string; propia: boolean }[];
  /** PB-155 (HU-134): lo que se registró del reglamento o protocolo. */
  revisiones_normativas: RevisionNormativa[];
  /** PB-155: versiones publicadas y vigentes que se pueden citar. */
  opciones_normativa: {
    protocolos: { id: string; nombre: string }[];
    documentos: { id: string; nombre: string }[];
  };
  /** PB-047, PB-048 y PB-051: decisiones tomadas, sin editar ni borrar. */
  decisiones: {
    id: string;
    resultado: string;
    fundamento: string;
    revisado_por: string;
    revisado_en: string;
    /** Código de la situación original, si se descartó por duplicado. */
    duplicada_de: string | null;
  }[];
  /** PB-139: la última revisión que se ve; decidir sobre otra se rechaza. */
  ultima_revision_id: string | null;
  /** PB-053: el caso al que quedó vinculada, quién y cuándo (HU-045 CA2). */
  caso_vinculado: {
    id: string;
    codigo: string;
    vinculado_por: string;
    vinculado_en: string;
  } | null;
  /** PB-053 y PB-052: lo que necesitan los formularios de la sección Caso. */
  opciones_caso: {
    categorias: { id: string; nombre: string }[];
    categoria_sugerida_id: string | null;
    /** AAAA-MM-DD de hoy en la escuela. */
    hoy: string;
    /** Casos activos con los mismos estudiantes (HU-046 CA4). */
    casos_relacionados: {
      id: string;
      codigo: string;
      titulo: string;
      estado_actual: string;
    }[];
  };
  /** PB-066: evidencias de la situación y de las respuestas a sus aclaraciones. */
  evidencias: Evidencia[];
  /** PB-142 (HU-121): la registró Convivencia como registro histórico (PB-075). */
  registro_historico: boolean;
  /** PB-142 (HU-121): cambios de estado, urgencia o responsable, con quién y por qué. */
  cambios: {
    id: string;
    cambiado_en: string;
    /** null si el cambio se hizo sin una cuenta. */
    cambiado_por: string | null;
    /** Estado y urgencia van con su código; el responsable, con su nombre. */
    cambios: {
      campo: "estado" | "urgencia" | "responsable";
      antes: string | null;
      despues: string | null;
    }[];
    motivo: string | null;
  }[];
};

/** Misma forma que devuelve apps/api/src/modules/situaciones/revision-normativa.ts. */
export type RevisionNormativa = {
  id: string;
  revisado_en: string;
  revisado_por: string;
  aplicabilidad: string;
  modo_revision: string;
  fundamento: string;
  protocolo: string | null;
  referencias: {
    version_documento_id: string;
    documento: string;
    version: string;
    pagina_desde: number | null;
    pagina_hasta: number | null;
    titulo_seccion: string | null;
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

// PB-074: el historial de estudiantes (estudiantes/datos.ts) también la usa.
export async function pedir<T>(ruta: string): Promise<Respuesta<T>> {
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
  | { ok: true; id?: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos guardar el cambio. Revisa tu conexión e inténtalo nuevamente.";

/**
 * Envía un cambio a la API. Los errores se devuelven en vez de lanzarse, para
 * que el formulario los muestre sin perder lo escrito. PB-081: los protocolos
 * (protocolos/datos.ts) también la usan.
 */
export async function enviar(
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

  const datos = (await respuesta.json().catch(() => null)) as {
    id?: string;
    mensaje?: string;
    message?: string;
    errores?: Record<string, string>;
  } | null;
  if (respuesta.ok) return { ok: true, id: datos?.id };
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

/** HU-039: asigna o cambia a quien revisa; se envía el responsable que se veía (CA2). */
export function enviarCambioResponsable(
  id: string,
  cambio: {
    responsable_id: string;
    responsable_anterior_id: string;
    motivo: string;
  },
) {
  return enviar(
    "PATCH",
    `/convivencia/situaciones/${encodeURIComponent(id)}/responsable`,
    cambio,
  );
}

/** HU-040, HU-041 y HU-044: antecedente o descarte; la API vuelve a validar todo. */
export function enviarDecision(id: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/situaciones/${encodeURIComponent(id)}/decisiones`,
    cuerpo,
  );
}

/** HU-046: abre un caso desde la situación; responde con el id del caso. */
export function enviarCaso(id: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/situaciones/${encodeURIComponent(id)}/caso`,
    cuerpo,
  );
}

/** HU-045: vincula la situación a un caso existente; responde con el id del caso. */
export function enviarVinculacion(id: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/situaciones/${encodeURIComponent(id)}/vinculacion`,
    cuerpo,
  );
}

/** HU-131: mueve el caso a otra etapa con un motivo; la API vuelve a validar todo. */
export function enviarCambioEstadoCaso(id: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/casos/${encodeURIComponent(id)}/estado`,
    cuerpo,
  );
}

/** HU-047: cierra el caso con motivo y resumen; la API vuelve a validar todo. */
export function enviarCierreCaso(id: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/casos/${encodeURIComponent(id)}/cierre`,
    cuerpo,
  );
}

/** HU-071 CA1: aplica una versión publicada del protocolo al caso. */
export function enviarAplicacionProtocolo(id: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/casos/${encodeURIComponent(id)}/protocolos`,
    cuerpo,
  );
}

/** HU-071 CA2 y CA3: revisión del caso sin protocolo, como la de PB-155. */
export function enviarRevisionNormativaCaso(id: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/casos/${encodeURIComponent(id)}/revisiones-normativas`,
    cuerpo,
  );
}

/** HU-134: revisión normativa; la API vuelve a validar todo. */
export function enviarRevisionNormativa(id: string, cuerpo: unknown) {
  return enviar(
    "POST",
    `/convivencia/situaciones/${encodeURIComponent(id)}/revisiones-normativas`,
    cuerpo,
  );
}

/** HU-038: pregunta al profesor que registró la situación. */
export function enviarAclaracion(id: string, pregunta: string) {
  return enviar(
    "POST",
    `/convivencia/situaciones/${encodeURIComponent(id)}/aclaraciones`,
    { pregunta },
  );
}

// --- Registro por otros canales (PB-043, HU-036) ---

/** Misma forma que devuelve GET /convivencia/registro/opciones. */
type EstudianteOpcion = {
  id: string;
  persona_id: string;
  nombres: string;
  apellidos: string;
  codigo_estudiante: string;
};

export type OpcionesRegistro = {
  categorias: { id: string; nombre: string }[];
  cursos: {
    id: string;
    nombre: string;
    estudiantes: EstudianteOpcion[];
  }[];
  /** Estudiantes sin matrícula activa hoy, como retirados o egresados (HU-066). */
  sin_matricula: EstudianteOpcion[];
  funcionarios: { persona_id: string; nombre: string }[];
  apoderados: { persona_id: string; nombre: string }[];
};

export function obtenerOpcionesRegistro() {
  return pedir<OpcionesRegistro>("/convivencia/registro/opciones");
}

/** HU-036: la API valida todo de nuevo y responde con el id de la situación. */
export function enviarSituacion(cuerpo: unknown) {
  return enviar("POST", "/convivencia/situaciones", cuerpo);
}

/** PB-075 (HU-065): situación de un año anterior; queda como antecedente. */
export function enviarSituacionHistorica(cuerpo: unknown) {
  return enviar("POST", "/convivencia/situaciones/historicas", cuerpo);
}

/** HU-036 CA2: quién informó, separado de quién la registró. */
export function quienInformo(situacion: {
  tipo_origen: string;
  informante: string | null;
}) {
  if (situacion.tipo_origen === "PROFESOR") return null;
  const origen = NOMBRE_ORIGEN[situacion.tipo_origen] ?? situacion.tipo_origen;
  return situacion.informante ? `${origen}, ${situacion.informante}` : origen;
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
