import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// Datos del portal del profesor (PB-041). Se piden a la API desde el servidor
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
  codigo: string;
  nombre: string;
  seccion: string | null;
  nivel: string;
  anio: number;
  estado: string;
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

async function pedir<T>(ruta: string): Promise<Respuesta<T>> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Sin sesión no se llama a la API. La API igual verifica el token en cada petición.
  if (!token) redirect("/login");

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

// --- Mis registros (HU-034 CA2) ---

export type SituacionPropia = {
  id: string;
  codigo: string;
  ocurrido_en: string;
  reportado_en: string;
  estado: string;
  urgencia: string;
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
  evidencias: {
    id: string;
    titulo: string;
    tipo: string;
    creado_en: string;
    archivo: string | null;
  }[];
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