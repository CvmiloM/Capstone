"use server";

import { crearClienteServidor } from "@/lib/supabase/servidor";

export type EstadoSegundoFactor = {
  paso: "preparar" | "confirmar" | "completado" | "bloqueado" | "sin-sesion";
  factorId?: string;
  qr?: string;
  mensaje?: string;
  errorCodigo?: string;
};

const NOMBRE_FACTOR = "CONVI";
const SIN_CONEXION =
  "No pudimos conectar. Inténtalo nuevamente en unos minutos.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function explicarError(error: { code?: string }): string {
  switch (error.code) {
    case "mfa_verification_failed":
    case "mfa_challenge_expired":
      return "El código no es correcto o venció. Usa el código actual de tu aplicación e inténtalo nuevamente.";
    case "over_request_rate_limit":
    case "mfa_verification_rejected":
      return "Hiciste varios intentos. Espera unos minutos antes de volver a intentarlo.";
    default:
      return "No pudimos completar la configuración. Inténtalo nuevamente.";
  }
}

// Cada acción vuelve a comprobar la cuenta: ocultar botones no protege una petición.
async function comprobarCuenta() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.getUser();
  if (error && (!error.status || error.status >= 500))
    throw new Error(SIN_CONEXION);
  if (error || !data.user) {
    return {
      ok: false as const,
      estado: {
        paso: "sin-sesion",
        mensaje: "Tu sesión terminó. Inicia sesión nuevamente para continuar.",
      } satisfies EstadoSegundoFactor,
    };
  }
  const sesion = await supabase.auth.getSession();
  const token = sesion.data.session?.access_token;
  if (sesion.error || !token) {
    return {
      ok: false as const,
      estado: { paso: "sin-sesion" } as EstadoSegundoFactor,
    };
  }
  const url =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001";
  const respuesta = await fetch(`${url}/auth/sesion`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (respuesta.status === 401) {
    return {
      ok: false as const,
      estado: { paso: "sin-sesion" } as EstadoSegundoFactor,
    };
  }
  if (respuesta.status === 403) {
    return {
      ok: false as const,
      estado: {
        paso: "bloqueado",
        mensaje:
          "Necesitas una cuenta activa en un establecimiento para configurar el segundo factor.",
      } satisfies EstadoSegundoFactor,
    };
  }
  if (!respuesta.ok) throw new Error(SIN_CONEXION);
  const cuenta = await respuesta.json();
  if (!["ADMIN", "CONVIVENCIA"].includes(cuenta.codigo_perfil)) {
    return {
      ok: false as const,
      estado: {
        paso: "bloqueado",
        mensaje:
          "Esta configuración está disponible para Administración y Convivencia.",
      } satisfies EstadoSegundoFactor,
    };
  }
  return { ok: true as const, supabase, factores: data.user.factors ?? [] };
}

export async function consultarSegundoFactor(): Promise<EstadoSegundoFactor> {
  try {
    const cuenta = await comprobarCuenta();
    if (!cuenta.ok) return cuenta.estado;
    return {
      paso: cuenta.factores.some(
        (f) => f.factor_type === "totp" && f.status === "verified",
      )
        ? "completado"
        : "preparar",
    };
  } catch {
    // Nunca enviar al navegador errores internos, tokens ni respuestas completas de Auth.
    return { paso: "bloqueado", mensaje: SIN_CONEXION };
  }
}

export async function configurarSegundoFactor(
  formulario: FormData,
): Promise<EstadoSegundoFactor> {
  if (!(formulario instanceof FormData)) {
    return {
      paso: "bloqueado",
      mensaje: "La petición no es válida. Vuelve a abrir esta página.",
    };
  }
  const operacion = formulario.get("operacion");
  const factorId = formulario.get("factorId");
  const codigo = formulario.get("codigo");
  if (!["preparar", "confirmar", "cancelar"].includes(String(operacion))) {
    return {
      paso: "bloqueado",
      mensaje: "La petición no es válida. Vuelve a abrir esta página.",
    };
  }
  if (
    operacion !== "preparar" &&
    (typeof factorId !== "string" || !UUID.test(factorId))
  ) {
    return {
      paso: "preparar",
      mensaje: "La configuración ya no está disponible. Prepara un nuevo QR.",
    };
  }
  try {
    const cuenta = await comprobarCuenta();
    if (!cuenta.ok) return cuenta.estado;
    if (
      operacion === "confirmar" &&
      (typeof codigo !== "string" || !/^[0-9]{6}$/.test(codigo))
    ) {
      return {
        paso: "confirmar",
        errorCodigo: "Ingresa los seis dígitos que muestra tu aplicación.",
      };
    }
    const { supabase, factores } = cuenta;
    // Un factor confirmado se conserva, incluso si se vuelve a abrir la página.
    if (
      factores.some((f) => f.factor_type === "totp" && f.status === "verified")
    ) {
      return { paso: "completado" };
    }
    if (operacion === "preparar") {
      // Auth entrega el QR solo al crearlo. Un intento abandonado de CONVI se
      // reemplaza; nunca se borran factores confirmados ni de otras aplicaciones.
      for (const factor of factores.filter(
        (f) =>
          f.factor_type === "totp" &&
          f.status === "unverified" &&
          f.friendly_name === NOMBRE_FACTOR,
      )) {
        const { error } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (error) return { paso: "preparar", mensaje: explicarError(error) };
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: NOMBRE_FACTOR,
        issuer: "CONVI",
      });
      if (error) return { paso: "preparar", mensaje: explicarError(error) };
      // Solo el QR necesario para vincular la aplicación y su identificador.
      // No guardamos la clave ni la URI en CONVI, archivos o logs.
      // Auth entrega la imagen con saltos de línea. Esta conversión conserva
      // el QR y permite mostrarlo sin que Next rechace su dirección.
      const imagen = data.totp.qr_code.slice(
        data.totp.qr_code.indexOf(",") + 1,
      );
      const qr = `data:image/svg+xml;base64,${Buffer.from(imagen, "utf8").toString("base64")}`;
      return { paso: "confirmar", factorId: data.id, qr };
    }
    const factor = factores.find(
      (f) =>
        f.id === factorId &&
        f.factor_type === "totp" &&
        f.status === "unverified" &&
        f.friendly_name === NOMBRE_FACTOR,
    );
    if (!factor)
      return {
        paso: "preparar",
        mensaje:
          "El QR ya no está vigente. Prepara una nueva configuración y escanéala otra vez.",
      };
    if (operacion === "cancelar") {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: factor.id,
      });
      return error
        ? { paso: "confirmar", mensaje: explicarError(error) }
        : { paso: "preparar" };
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: codigo as string,
    });
    if (error) return { paso: "confirmar", mensaje: explicarError(error) };
    // El SDK renueva la sesión y el cliente SSR escribe las cookies de aal2.
    const confirmacion = await supabase.auth.mfa.listFactors();
    if (
      confirmacion.error ||
      !confirmacion.data.totp.some((f) => f.id === factor.id)
    ) {
      return {
        paso: "bloqueado",
        mensaje:
          "No pudimos comprobar la confirmación. Vuelve a consultar el estado.",
      };
    }
    return { paso: "completado" };
  } catch {
    return {
      paso: operacion === "preparar" ? "preparar" : "confirmar",
      mensaje: SIN_CONEXION,
    };
  }
}
