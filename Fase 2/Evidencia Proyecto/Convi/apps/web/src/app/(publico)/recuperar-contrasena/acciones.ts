"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { LARGO_MAXIMO, LARGO_MINIMO_CONTRASENA } from "../limites";

export type EstadoRecuperacion = {
  paso?: "codigo" | "contrasena" | "invalido" | "completado";
  mensaje?: string;
  errores?: Record<string, string>;
  correo?: string;
  enviado?: boolean;
};

const ENLACE_INVALIDO =
  "El enlace venció, ya se usó o no es válido. Solicita uno nuevo para continuar.";
const SIN_CONEXION =
  "No pudimos conectar. Inténtalo nuevamente en unos minutos.";

export async function solicitarRecuperacion(
  _anterior: EstadoRecuperacion,
  formulario: FormData,
): Promise<EstadoRecuperacion> {
  const valor =
    formulario instanceof FormData ? formulario.get("correo") : null;
  const correo = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  if (
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) ||
    correo.length > LARGO_MAXIMO.correo
  ) {
    return { errores: { correo: "Ingresa un correo válido." }, correo };
  }
  try {
    const supabase = await crearClienteServidor();
    // La plantilla usa SiteURL: no aceptamos un destino indicado por el navegador.
    await supabase.auth.resetPasswordForEmail(correo);
  } catch {
    // También los fallos y límites devuelven lo mismo: no revelar identidades.
  }
  return { enviado: true };
}

async function comprobarRecuperacion() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  // verifyOtp entrega la sesión del destinatario. Auth también permite cambiar
  // la contraseña propia desde una sesión existente; nunca aceptamos otro ID.
  if (error || !claims) return null;
  const usuario = await supabase.auth.getUser();
  if (usuario.error || usuario.data.user?.id !== claims.sub) return null;
  const factor = usuario.data.user.factors?.find(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  return {
    supabase,
    factor,
    requiereCodigo: !!factor && claims.aal !== "aal2",
  };
}

export async function consultarRestablecimiento(): Promise<EstadoRecuperacion> {
  try {
    const actual = await comprobarRecuperacion();
    return actual
      ? { paso: actual.requiereCodigo ? "codigo" : "contrasena" }
      : { paso: "invalido", mensaje: ENLACE_INVALIDO };
  } catch {
    return { paso: "invalido", mensaje: SIN_CONEXION };
  }
}

export async function aceptarEnlaceRecuperacion(
  _anterior: EstadoRecuperacion,
  formulario: FormData,
): Promise<EstadoRecuperacion> {
  const token =
    formulario instanceof FormData ? formulario.get("token_hash") : null;
  const tipo = formulario instanceof FormData ? formulario.get("tipo") : null;
  if (
    typeof token !== "string" ||
    !token ||
    token.length > 512 ||
    tipo !== "recovery"
  )
    return { paso: "invalido", mensaje: ENLACE_INVALIDO };
  try {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: "recovery",
    });
    if (error) return { paso: "invalido", mensaje: ENLACE_INVALIDO };
  } catch {
    return { mensaje: SIN_CONEXION };
  }
  // Quita el token de la dirección y usa las cookies recién confirmadas.
  redirect("/restablecer-contrasena");
}

export async function restablecerContrasena(
  _anterior: EstadoRecuperacion,
  formulario: FormData,
): Promise<EstadoRecuperacion> {
  if (!(formulario instanceof FormData))
    return { paso: "invalido", mensaje: ENLACE_INVALIDO };
  const contrasena = formulario.get("contrasena");
  const confirmacion = formulario.get("confirmacion");
  const errores: Record<string, string> = {};
  if (
    typeof contrasena !== "string" ||
    contrasena.length < LARGO_MINIMO_CONTRASENA
  )
    errores.contrasena = `Usa al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`;
  else if (contrasena !== confirmacion)
    errores.confirmacion = "Las contraseñas no coinciden.";
  if (Object.keys(errores).length) return { errores };

  try {
    const actual = await comprobarRecuperacion();
    if (!actual) return { paso: "invalido", mensaje: ENLACE_INVALIDO };
    const { supabase } = actual;
    if (actual.requiereCodigo) {
      const codigo = formulario.get("codigo");
      if (typeof codigo !== "string" || !/^[0-9]{6}$/.test(codigo))
        return {
          paso: "codigo",
          errores: { codigo: "Ingresa los seis dígitos de tu aplicación." },
        };
      const verificacion = await supabase.auth.mfa.challengeAndVerify({
        factorId: actual.factor!.id,
        code: codigo,
      });
      if (verificacion.error)
        return {
          paso: "codigo",
          errores: {
            codigo:
              "No pudimos verificar el código. Usa el actual o espera antes de reintentar.",
          },
        };
    }
    // Auth decide la identidad desde la sesión verificada, nunca desde un ID del formulario.
    const cambio = await supabase.auth.updateUser({
      password: contrasena as string,
    });
    if (cambio.error) {
      if (["weak_password", "same_password"].includes(cambio.error.code ?? ""))
        return {
          paso: "contrasena",
          errores: { contrasena: "Elige una contraseña nueva y más segura." },
        };
      return {
        paso: "contrasena",
        mensaje:
          "No pudimos cambiar la contraseña. Reintenta o solicita un enlace nuevo.",
      };
    }
    let sesionCerrada = false;
    try {
      const salida = await supabase.auth.signOut({ scope: "local" });
      sesionCerrada = !salida.error;
    } catch {
      // La contraseña ya cambió: un fallo de salida no debe anunciar lo contrario.
    }
    return {
      paso: "completado",
      mensaje: sesionCerrada
        ? "Tu contraseña se cambió. Inicia sesión con la nueva contraseña."
        : "Tu contraseña se cambió. No pudimos cerrar esta sesión; ciérrala antes de volver a ingresar.",
    };
  } catch {
    return { mensaje: SIN_CONEXION };
  }
}
