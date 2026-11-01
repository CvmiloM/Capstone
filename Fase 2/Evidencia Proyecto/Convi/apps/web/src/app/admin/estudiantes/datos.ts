import { redirect } from "next/navigation";
import type { ResumenAccesoPortal } from "../apoderados/datos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { pedirAdmin } from "../datos";

// PB-017 y PB-018 (HU-014): estudiantes y matrículas del portal de
// administración. Se piden a la API desde el servidor de Next con el token de
// la sesión; la API vuelve a comprobar el perfil ADMIN, el segundo factor y la
// escuela.

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Mismas formas que devuelven estudiantes.service.ts y matriculas.service.ts.
export type Estudiante = {
  id: string;
  codigo_estudiante: string;
  nombres: string;
  apellidos: string;
  rut: string | null;
  /** ACTIVO, INACTIVO o EGRESADO. */
  estado: string;
  /** Curso de la matrícula vigente, si tiene. */
  curso_id: string | null;
  curso_nombre: string | null;
  anio: number | null;
};

export type Nomina = {
  estudiantes: Estudiante[];
  total: number;
  pagina: number;
  por_pagina: number;
};

export type Matricula = {
  id: string;
  curso_id: string;
  curso_codigo: string;
  curso_nombre: string;
  anio_academico_id: string;
  anio: number;
  anio_estado: string;
  /** ACTIVO, TRASLADADO, COMPLETADO o RETIRADO. */
  estado: string;
  /** AAAA-MM-DD. */
  matriculado_en: string;
  finalizado_en: string | null;
};

export type FichaEstudiante = {
  id: string;
  codigo_estudiante: string;
  nombres: string;
  apellidos: string;
  rut: string | null;
  /** AAAA-MM-DD. */
  fecha_nacimiento: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  estado: string;
  /** La más reciente primero. */
  matriculas: Matricula[];
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

/**
 * Una página de la nómina, filtrada por texto, curso y estado. Sin estado, la
 * API muestra solo a los estudiantes Activos (PB-031).
 */
export async function obtenerNomina(filtro: {
  buscar: string;
  curso: string;
  pagina: number;
  estado: string;
}): Promise<Nomina> {
  const parametros = new URLSearchParams();
  if (filtro.buscar) parametros.set("buscar", filtro.buscar);
  if (filtro.curso) parametros.set("curso", filtro.curso);
  if (filtro.estado) parametros.set("estado", filtro.estado);
  if (filtro.pagina > 1) parametros.set("pagina", String(filtro.pagina));
  const nomina = await pedir<Nomina>(`/admin/estudiantes?${parametros}`);
  return nomina ?? { estudiantes: [], total: 0, pagina: 1, por_pagina: 50 };
}

/** La ficha con sus matrículas, o null si no es de la escuela. */
export function obtenerFicha(id: string) {
  return pedir<FichaEstudiante>(`/admin/estudiantes/${encodeURIComponent(id)}`);
}

export type PersonaApoderada = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string | null;
  correo: string | null;
  telefono: string | null;
};

export type VinculoApoderado = PersonaApoderada &
  ResumenAccesoPortal & {
    persona_apoderado_id: string;
    direccion: string | null;
    tipo_relacion: string | null;
    es_principal: boolean;
    puede_ser_contactado: boolean;
    activo_desde: string | null;
    activo_hasta: string | null;
    vigencia: "VIGENTE" | "FUTURO" | "TERMINADO";
    /** PB-021: otros estudiantes con los que está vinculada la misma persona. */
    otros_estudiantes: number;
    /** PB-021: tiene cuenta o invitación en CONVI. */
    tiene_cuenta: boolean;
  };

export function obtenerApoderados(id: string, buscar: string) {
  return pedir<{ vinculos: VinculoApoderado[]; personas: PersonaApoderada[] }>(
    `/admin/estudiantes/${encodeURIComponent(id)}/apoderados?${new URLSearchParams({ buscar })}`,
  );
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
  // HU-014: la API indica cada campo con problema y no guarda nada.
  if (respuesta.status === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
    };
  }
  // 403, 404 y 409 (estudiante inactivo, otra matrícula vigente): la API
  // explica qué pasó.
  if ([403, 404, 409].includes(respuesta.status) && datos?.message) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: SIN_CONEXION };
}

export async function enviarDesactivacion(cuerpo: unknown) {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(
      `${URL_API}/admin/estudiantes/desactivacion`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cuerpo),
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      },
    );
    if (respuesta.status === 401) return { ok: false as const, mensaje: "Tu sesión terminó, vuelve a iniciar sesión antes de continuar" };
    const datos = await respuesta.json();
    return respuesta.ok
      ? { ok: true as const }
      : {
          ok: false as const,
          mensaje:
            datos.message ||
            datos.mensaje ||
            "No se pudo completar la desactivación",
        };
  } catch {
    return {
      ok: false as const,
      mensaje:
        "No pudimos confirmar el resultado, recarga la nómina antes de intentar nuevamente",
    };
  }
}
