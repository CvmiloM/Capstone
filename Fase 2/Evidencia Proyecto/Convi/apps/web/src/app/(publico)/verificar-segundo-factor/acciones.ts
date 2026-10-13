"use server";

import { crearClienteServidor } from "@/lib/supabase/servidor";
import { consultarCuentaActiva, destinoDelPerfil } from "@/lib/supabase/cuenta";

export type EstadoVerificacion = {
  paso: "codigo" | "configurar" | "completado" | "bloqueado" | "sin-sesion";
  mensaje?: string;
  errorCodigo?: string;
  destino?: ReturnType<typeof destinoDelPerfil>;
};

const SIN_CONEXION =
  "No pudimos conectar. Inténtalo nuevamente en unos minutos.";

async function comprobarVerificacion() {
  const supabase = await crearClienteServidor();
  const consulta = await consultarCuentaActiva(supabase);
  if (consulta.estado !== "activa") {
    return {
      supabase,
      estado: {
        paso: consulta.estado === "sin-sesion" ? "sin-sesion" : "bloqueado",
        mensaje:
          consulta.estado === "sin-conexion"
            ? SIN_CONEXION
            : consulta.estado === "sin-sesion"
              ? "Tu sesión terminó. Inicia sesión nuevamente."
              : "Necesitas una cuenta activa en un establecimiento para continuar.",
      } satisfies EstadoVerificacion,
    };
  }
  const { cuenta } = consulta;
  if (!cuenta.segundo_factor_pendiente) {
    return {
      supabase,
      estado: {
        paso: "completado",
        mensaje: cuenta.requiere_segundo_factor
          ? undefined
          : "Tu perfil no necesita segundo factor para acceder a sus funciones.",
        destino: destinoDelPerfil(cuenta.codigo_perfil),
      } satisfies EstadoVerificacion,
    };
  }
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(SIN_CONEXION);
  // Solo se verifica una aplicación confirmada de esta misma identidad.
  const factor = data.totp[0];
  return {
    supabase,
    factorId: factor?.id,
    estado: {
      paso: factor ? "codigo" : "configurar",
    } satisfies EstadoVerificacion,
  };
}

export async function consultarVerificacion(): Promise<EstadoVerificacion> {
  try {
    return (await comprobarVerificacion()).estado;
  } catch {
    return { paso: "bloqueado", mensaje: SIN_CONEXION };
  }
}

export async function verificarSegundoFactor(
  formulario: FormData,
): Promise<EstadoVerificacion> {
  try {
    // Se vuelve a consultar la cuenta incluso si la pantalla ya estaba abierta.
    const actual = await comprobarVerificacion();
    if (actual.estado.paso !== "codigo" || !actual.factorId)
      return actual.estado;
    const codigo =
      formulario instanceof FormData ? formulario.get("codigo") : null;
    if (typeof codigo !== "string" || !/^[0-9]{6}$/.test(codigo)) {
      return {
        paso: "codigo",
        errorCodigo: "Ingresa los seis dígitos de tu aplicación.",
      };
    }
    const { error } = await actual.supabase.auth.mfa.challengeAndVerify({
      factorId: actual.factorId,
      code: codigo,
    });
    if (error) {
      return {
        paso: "codigo",
        errorCodigo:
          error.code === "over_request_rate_limit" ||
          error.code === "mfa_verification_rejected"
            ? "Hiciste varios intentos. Espera unos minutos antes de volver a intentarlo."
            : "No pudimos verificar el código. Usa el código actual de tu aplicación e inténtalo nuevamente.",
      };
    }
    // Auth escribe la nueva sesión en cookies; la API confirma que ya tiene aal2.
    const siguiente = (await comprobarVerificacion()).estado;
    return siguiente.paso === "codigo"
      ? { paso: "bloqueado", mensaje: SIN_CONEXION }
      : siguiente;
  } catch {
    // No devolver errores internos, códigos, tokens ni datos completos de Auth.
    return { paso: "bloqueado", mensaje: SIN_CONEXION };
  }
}
