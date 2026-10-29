import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { pedirAdmin } from "../datos";

// PB-010 (HU-009): cuentas de la escuela e invitaciones. Se piden a la API
// desde el servidor de Next con el token de la sesión; la API vuelve a
// comprobar el perfil ADMIN, el segundo factor y la escuela en cada petición.

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Misma forma que devuelve apps/api/src/modules/cuentas/cuentas.service.ts.
export type CuentaEscuela = {
  id: string;
  nombres: string;
  apellidos: string;
  correo: string;
  perfil: string;
  estado: string;
  es_propia: boolean;
  /** Nombre de quien invitó; null en la cuenta del primer administrador. */
  invitado_por: string | null;
  invitado_en: string | null;
  activado_en: string | null;
  suspendido_en: string | null;
  reactivado_en: string | null;
};

export type ResultadoInvitacion =
  | { ok: true; correo: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_CONEXION =
  "No pudimos enviar la invitación, inténtalo de nuevo en unos minutos";

async function tokenDeSesion() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Sin sesión no se llama a la API. La API igual verifica el token en cada petición.
  if (!token) redirect("/login");
  return token;
}

/** Cuentas de la escuela de la sesión, primero las pendientes de activar. */
export async function obtenerCuentas(): Promise<CuentaEscuela[]> {
  const respuesta = await pedirAdmin("/admin/cuentas");
  // Cualquier otro error lo muestra error.tsx con su botón de reintentar.
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return (await respuesta.json()) as CuentaEscuela[];
}

/**
 * Envía la invitación a la API, que crea la cuenta Pendiente y manda el
 * correo. Los errores se devuelven en vez de lanzarse, para que el
 * formulario no pierda lo que escribió el administrador.
 */
export async function enviarInvitacion(cuerpo: {
  nombres: string;
  apellidos: string;
  correo: string;
  perfil: string;
}): Promise<ResultadoInvitacion> {
  return enviar("/admin/cuentas/invitaciones", cuerpo);
}

export async function reenviarInvitacion(
  id: string,
): Promise<ResultadoInvitacion> {
  return enviar(`/admin/cuentas/${encodeURIComponent(id)}/reenviar-invitacion`);
}

export async function invitarApoderado(vinculoId: string): Promise<ResultadoInvitacion> {
  return enviar(`/admin/cuentas/apoderados/${encodeURIComponent(vinculoId)}/invitacion`);
}

export async function suspenderCuenta(
  id: string,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  return cambiarEstado(id, "suspender");
}

export async function reactivarCuenta(id: string, motivo: string) {
  return cambiarEstado(id, "reactivar", motivo);
}

export async function restablecerSegundoFactor(id: string, cuerpo: {
  solicitud_id: string; identidad_verificada: boolean; medio: string; motivo: string;
}): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}/admin/cuentas/${encodeURIComponent(id)}/restablecer-segundo-factor`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo), cache: "no-store", signal: AbortSignal.timeout(30000),
    });
  } catch {
    return { ok: false, mensaje: "No pudimos confirmar el resultado, reintenta desde este mismo formulario para completar la solicitud" };
  }
  if (respuesta.status === 401) redirect("/login");
  if (respuesta.ok) return { ok: true };
  const datos = await respuesta.json().catch(() => null);
  return { ok: false, mensaje: [400, 403, 404, 409, 503].includes(respuesta.status) && typeof datos?.message === "string"
    ? datos.message : "No pudimos confirmar el resultado, reintenta desde este mismo formulario" };
}

async function cambiarEstado(
  id: string,
  accion: "suspender" | "reactivar",
  motivo?: string,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const token = await tokenDeSesion();
  let respuesta: Response;
  try {
    respuesta = await fetch(
      `${URL_API}/admin/cuentas/${encodeURIComponent(id)}/${accion}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: motivo === undefined ? undefined : JSON.stringify({ motivo }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    return {
      ok: false,
      mensaje:
        "No pudimos confirmar el cambio, actualiza la lista antes de intentarlo nuevamente",
    };
  }
  if (respuesta.status === 401) redirect("/login");
  if (respuesta.ok) return { ok: true };
  const datos = await respuesta.json().catch(() => null);
  return {
    ok: false,
    mensaje:
      [400, 403, 404, 409].includes(respuesta.status) &&
      typeof datos?.message === "string"
        ? datos.message
        : respuesta.status === 400 && typeof datos?.errores?.motivo === "string"
          ? datos.errores.motivo
          : "No pudimos cambiar el estado de la cuenta, inténtalo nuevamente",
  };
}

// Ambos envíos conservan el mismo manejo de sesión, conexión y errores de la API.
async function enviar(
  ruta: string,
  cuerpo?: unknown,
): Promise<ResultadoInvitacion> {
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
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) redirect("/login");

  const datos = (await respuesta.json().catch(() => null)) as {
    correo?: string;
    mensaje?: string;
    message?: string;
    errores?: Record<string, string>;
  } | null;
  if (respuesta.status === 201 && datos?.correo) {
    return { ok: true, correo: datos.correo };
  }
  // HU-009 CA1 y CA2: la API indica cada campo con problema y no crea nada.
  if (respuesta.status === 400 && datos?.errores) {
    return {
      ok: false,
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
    };
  }
  // 403 o 503 (por ejemplo, demasiados correos seguidos): la API explica qué pasó.
  if ([403, 404, 409, 503].includes(respuesta.status) && datos?.message) {
    return { ok: false, mensaje: datos.message };
  }
  return { ok: false, mensaje: SIN_CONEXION };
}
