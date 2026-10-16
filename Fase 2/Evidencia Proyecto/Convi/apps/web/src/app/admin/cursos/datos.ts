import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { pedirAdmin } from "../datos";
import type { AnioAcademico } from "../anios/datos";
import type { NivelEducativo } from "../niveles/datos";
import type { Rol } from "./opciones";

// PB-015 (HU-013): cursos y profesores asignados del portal de administración.
// Se piden a la API desde el servidor de Next con el token de la sesión; la API
// vuelve a comprobar el perfil ADMIN, el segundo factor y la escuela.

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Mismas formas que devuelven cursos.service.ts y asignaciones.service.ts.
export type Curso = {
  id: string;
  codigo: string;
  nombre: string;
  seccion: string | null;
  estado: string;
  anio_academico_id: string;
  anio: number;
  anio_estado: string;
  nivel_id: string;
  nivel_codigo: string;
  nivel_nombre: string;
  nivel_activo: boolean;
  /** Matrículas activas. */
  estudiantes: number;
  /** Todas las matrículas: con alguna, el nivel ya no cambia. */
  matriculas: number;
  profesor_jefe: string | null;
  profesores: number;
};

export type Asignacion = {
  id: string;
  rol: Rol;
  /** AAAA-MM-DD. */
  fecha_inicio: string | null;
  fecha_fin: string | null;
  situacion: "VIGENTE" | "PROGRAMADA" | "TERMINADA";
  membresia_id: string;
  nombres: string;
  apellidos: string;
  correo: string | null;
  estado_cuenta: string;
};

export type DetalleCurso = Curso & { asignaciones: Asignacion[] };

export type ProfesorDisponible = {
  membresia_id: string;
  nombres: string;
  apellidos: string;
  correo: string | null;
  estado: string;
};

export type Resultado =
  | { ok: true; id: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos guardar los cambios. Inténtalo de nuevo en unos minutos.";

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

/** Datos de la portada juntos, sin esperar primero años y luego otra petición de cursos. */
export async function obtenerVistaCursos(anio?: string): Promise<{
  anios: AnioAcademico[];
  anio: AnioAcademico | null;
  niveles: NivelEducativo[];
  cursos: Curso[];
}> {
  const consulta = anio ? `?anio=${encodeURIComponent(anio)}` : "";
  const respuesta = await pedirAdmin(`/admin/cursos/vista${consulta}`);
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return respuesta.json();
}

/** Cursos de un año, en el orden de sus niveles. */
export async function obtenerCursos(anioId: string) {
  const cursos = await pedir<Curso[]>(
    `/admin/cursos?anio=${encodeURIComponent(anioId)}`,
  );
  return cursos ?? [];
}

/** El curso con sus asignaciones, o null si no es de la escuela. */
export function obtenerCurso(id: string) {
  return pedir<DetalleCurso>(`/admin/cursos/${encodeURIComponent(id)}`);
}

/** Profesores con la cuenta Activa o Pendiente que se pueden asignar. */
export async function obtenerProfesores() {
  const profesores = await pedir<ProfesorDisponible[]>(
    "/admin/asignaciones/profesores",
  );
  return profesores ?? [];
}

/**
 * Envía un cambio a la API, que vuelve a validar todo. Los errores se
 * devuelven en vez de lanzarse, para que el formulario no pierda lo escrito.
 */
export async function enviarCambio(
  metodo: "POST" | "PATCH",
  ruta: string,
  cuerpo: unknown,
): Promise<Resultado> {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
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
  // HU-013: la API indica cada campo con problema y no guarda nada.
  if (respuesta.status === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
    };
  }
  // 403, 404 y 409 (año cerrado, profesor repetido, otro profesor jefe): la
  // API explica qué pasó.
  if ([403, 404, 409].includes(respuesta.status) && datos?.message) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: SIN_CONEXION };
}
