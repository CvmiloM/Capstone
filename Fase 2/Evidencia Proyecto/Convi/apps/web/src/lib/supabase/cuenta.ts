import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CuentaActiva = {
  codigo_perfil: "ADMIN" | "CONVIVENCIA" | "PROFESOR" | "APODERADO";
  requiere_segundo_factor: boolean;
  segundo_factor_pendiente: boolean;
};

export type ConsultaCuenta =
  | { estado: "activa"; cuenta: CuentaActiva }
  | { estado: "sin-sesion" }
  | { estado: "bloqueada" }
  | { estado: "sin-conexion" };

// El login y la confirmación del segundo factor usan los mismos destinos.
export function destinoDelPerfil(perfil: CuentaActiva["codigo_perfil"]) {
  const destinos = {
    ADMIN: "/admin",
    CONVIVENCIA: "/convivencia",
    PROFESOR: "/profesor",
    APODERADO: "/apoderado",
  } as const;
  return destinos[perfil];
}

// Un 403 no distingue registro pendiente de suspensión: lo decide otra consulta del servidor.
export async function consultarRegistroInicial(supabase: SupabaseClient) {
  try {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) return "sin-conexion";
    const url =
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3001";
    const respuesta = await fetch(`${url}/registro/escuela/estado`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if ([401, 403].includes(respuesta.status)) return "no-disponible";
    if (!respuesta.ok) return "sin-conexion";
    const estado = await respuesta.json();
    if (typeof estado?.puede_registrar !== "boolean") return "sin-conexion";
    return estado.puede_registrar ? "pendiente" : "no-disponible";
  } catch {
    return "sin-conexion";
  }
}

// El perfil y el segundo factor los confirma la API, nunca un campo del navegador.
export async function consultarCuentaActiva(
  supabase: SupabaseClient,
): Promise<ConsultaCuenta> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { estado: "sin-conexion" };
    const token = data.session?.access_token;
    if (!token) return { estado: "sin-sesion" };
    const url =
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3001";
    const respuesta = await fetch(`${url}/auth/sesion`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (respuesta.status === 401) return { estado: "sin-sesion" };
    if (respuesta.status === 403) return { estado: "bloqueada" };
    if (!respuesta.ok) return { estado: "sin-conexion" };
    const cuenta = await respuesta.json();
    if (
      !cuenta ||
      !["ADMIN", "CONVIVENCIA", "PROFESOR", "APODERADO"].includes(
        cuenta.codigo_perfil,
      ) ||
      typeof cuenta.requiere_segundo_factor !== "boolean" ||
      typeof cuenta.segundo_factor_pendiente !== "boolean" ||
      // Una respuesta incompleta no debe abrir los portales protegidos.
      cuenta.requiere_segundo_factor !==
        ["ADMIN", "CONVIVENCIA"].includes(cuenta.codigo_perfil) ||
      (!cuenta.requiere_segundo_factor && cuenta.segundo_factor_pendiente)
    ) {
      return { estado: "sin-conexion" };
    }
    return { estado: "activa", cuenta };
  } catch {
    return { estado: "sin-conexion" };
  }
}
