"use server";

import { crearClienteServidor } from "@/lib/supabase/servidor";
import { redirect } from "next/navigation";
import {
  consultarCuentaActiva,
  consultarRegistroInicial,
  destinoDelPerfil,
} from "@/lib/supabase/cuenta";
import { LARGO_MAXIMO, LARGO_MINIMO_CONTRASENA } from "./limites";

// Acciones de los formularios públicos. Todas validan los datos en el servidor.
// El registro, el login y la activación de invitaciones (PB-003) usan Supabase Auth.

export type EstadoFormulario = {
  /** Error general del formulario (credenciales, enlace vencido, etc.). */
  mensaje?: string;
  /** Error por campo, con la clave igual al `name` del input. */
  errores?: Record<string, string>;
  /** Valores enviados, para no vaciar el formulario si hay errores. Nunca incluye contraseñas. */
  valores?: Record<string, string>;
  exito?: boolean;
};

// Mismo patrón que convi.correo_valido.
const FORMATO_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";
const LOGIN_SIN_CONEXION =
  "No pudimos conectar. Inténtalo nuevamente en unos minutos.";
const LOGIN_RECHAZADO =
  "No pudimos iniciar sesión con esos datos. Comprueba tu correo y contraseña y que tu cuenta tenga acceso a CONVI.";
const ENLACE_INVALIDO =
  "El enlace de invitación no es válido. Pide al administrador de tu establecimiento que te lo reenvíe.";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// Las contraseñas no se recortan: los espacios son parte de la contraseña.
function leerContrasena(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

function validarCorreo(correo: string, errores: Record<string, string>) {
  if (!FORMATO_CORREO.test(correo) || correo.length > LARGO_MAXIMO.correo) {
    errores.correo = "Ingresa un correo válido.";
  }
}

function validarNuevaContrasena(
  contrasena: string,
  confirmacion: string,
  errores: Record<string, string>,
) {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
    errores.contrasena = `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`;
  } else if (contrasena !== confirmacion) {
    errores.confirmacion = "Las contraseñas no coinciden.";
  }
}

export async function iniciarSesion(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  if (!(formData instanceof FormData)) return { mensaje: LOGIN_RECHAZADO };
  const correo = leerTexto(formData, "correo").toLowerCase();
  const contrasena = leerContrasena(formData, "contrasena");
  const valores = { correo };
  const errores: Record<string, string> = {};

  validarCorreo(correo, errores);
  if (!contrasena) errores.contrasena = "Ingresa tu contraseña.";
  if (Object.keys(errores).length > 0) return { errores, valores };

  let destino: string;
  try {
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    });
    if (error) {
      if (error.code === "over_request_rate_limit") {
        return {
          mensaje:
            "Hiciste varios intentos. Espera unos minutos antes de volver a intentarlo.",
          valores,
        };
      }
      return {
        mensaje:
          !error.status || error.status >= 500
            ? LOGIN_SIN_CONEXION
            : LOGIN_RECHAZADO,
        valores,
      };
    }
    if (!data.session || !data.user)
      return { mensaje: LOGIN_RECHAZADO, valores };

    // La contraseña confirma la identidad; la API decide si su cuenta y escuela permiten entrar.
    const consulta = await consultarCuentaActiva(supabase);
    if (consulta.estado !== "activa") {
      const registro =
        consulta.estado === "bloqueada"
          ? await consultarRegistroInicial(supabase)
          : "no-disponible";
      if (registro === "pendiente") {
        destino = "/registro/escuela";
      } else {
        // Cerrar solo este intento rechazado, sin cerrar las sesiones de otros dispositivos.
        const salida = await supabase.auth.signOut({ scope: "local" });
        return {
          mensaje:
            consulta.estado === "sin-conexion" ||
            registro === "sin-conexion" ||
            salida.error
              ? LOGIN_SIN_CONEXION
              : LOGIN_RECHAZADO,
          valores,
        };
      }
    } else {
      destino = consulta.cuenta.segundo_factor_pendiente
        ? "/verificar-segundo-factor"
        : destinoDelPerfil(consulta.cuenta.codigo_perfil);
    }
  } catch {
    // No devolver contraseñas, tokens ni mensajes internos del proveedor de autenticación.
    return { mensaje: LOGIN_SIN_CONEXION, valores };
  }
  // redirect interrumpe la acción: debe quedar fuera del manejo de errores.
  redirect(destino);
}

export async function registrarAdministrador(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = {
    nombres: leerTexto(formData, "nombres"),
    apellidos: leerTexto(formData, "apellidos"),
    correo: leerTexto(formData, "correo").toLowerCase(),
    telefono: leerTexto(formData, "telefono"),
  };
  const contrasena = leerContrasena(formData, "contrasena");
  const confirmacion = leerContrasena(formData, "confirmacion");
  const errores: Record<string, string> = {};

  if (!valores.nombres) errores.nombres = "Ingresa tus nombres.";
  if (!valores.apellidos) errores.apellidos = "Ingresa tus apellidos.";
  validarCorreo(valores.correo, errores);
  for (const campo of ["nombres", "apellidos", "telefono"] as const) {
    if (!errores[campo] && valores[campo].length > LARGO_MAXIMO[campo]) {
      errores[campo] = `Usa como máximo ${LARGO_MAXIMO[campo]} caracteres.`;
    }
  }
  validarNuevaContrasena(contrasena, confirmacion, errores);
  if (Object.keys(errores).length > 0) return { errores, valores };

  // Crea la identidad en Supabase Auth y envía el correo de verificación
  // (supabase/templates/confirmacion.html). Antes de verificar no se crea nada
  // en CONVI (HU-001 CA2): nombres, apellidos y teléfono quedan en los
  // metadatos de la identidad hasta que el backend llame a
  // convi.registrar_primer_administrador con los datos de la escuela (PB-002).
  // La contraseña queda solo en Supabase Auth y nunca se escribe en logs.
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signUp({
    email: valores.correo,
    password: contrasena,
    options: {
      data: {
        nombres: valores.nombres,
        apellidos: valores.apellidos,
        telefono: valores.telefono || null,
      },
    },
  });

  if (error) {
    switch (error.code) {
      case "weak_password":
        return {
          errores: { contrasena: "Elige una contraseña más segura." },
          valores,
        };
      case "email_address_invalid":
        return { errores: { correo: "Ingresa un correo válido." }, valores };
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
        return {
          mensaje:
            "Hiciste varios intentos seguidos. Espera unos minutos y vuelve a intentarlo.",
          valores,
        };
      default:
        return {
          mensaje:
            "No pudimos crear tu cuenta. Inténtalo de nuevo en unos minutos.",
          valores,
        };
    }
  }

  // Si el correo ya tenía cuenta, Supabase responde igual que con uno nuevo
  // (y no envía otro correo si ya estaba verificado). Así nadie puede
  // averiguar qué correos están registrados en CONVI.
  return { exito: true, valores };
}

export async function activarCuenta(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const tokenHash = leerTexto(formData, "token_hash");
  const membresia = leerTexto(formData, "membresia");
  const tipoToken = leerTexto(formData, "tipo_token") || "invite";
  const contrasena = leerContrasena(formData, "contrasena");
  const confirmacion = leerContrasena(formData, "confirmacion");
  const errores: Record<string, string> = {};

  if (
    !tokenHash ||
    !FORMATO_UUID.test(membresia) ||
    (tipoToken !== "invite" && tipoToken !== "magiclink")
  ) {
    return { mensaje: ENLACE_INVALIDO };
  }
  validarNuevaContrasena(contrasena, confirmacion, errores);
  if (Object.keys(errores).length > 0) return { errores };

  let destino: string;
  try {
    const supabase = await crearClienteServidor();
    // HU-003 CA3: Supabase acepta el enlace una sola vez y solo mientras no
    // venza. Si este navegador ya lo verificó (por ejemplo, la activación se
    // cortó a medio camino), se continúa con esa misma sesión.
    const verificacion = await supabase.auth.verifyOtp({
      // PB-011 también permite continuar una invitación cuyo correo ya se confirmó.
      type: tipoToken,
      token_hash: tokenHash,
    });
    if (verificacion.error) {
      const actual = await supabase.auth.getUser();
      if (actual.error || !actual.data.user?.email_confirmed_at) {
        return { mensaje: ENLACE_INVALIDO };
      }
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { mensaje: ENLACE_INVALIDO };

    // CA1 y CA2: la API llama a convi.activar_invitacion con la identidad del
    // token; la escuela, la persona y el perfil los asignó el administrador.
    const respuesta = await fetch(`${URL_API}/cuentas/activacion`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ membresia_id: membresia }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (respuesta.status >= 500) {
      // Se conserva la sesión para que reintentar funcione con el mismo enlace.
      return { mensaje: LOGIN_SIN_CONEXION };
    }
    if (!respuesta.ok) {
      const datos = (await respuesta.json().catch(() => null)) as {
        message?: string;
      } | null;
      // Sin cuenta que activar, la sesión del enlace no sirve: se cierra aquí.
      await supabase.auth.signOut({ scope: "local" });
      return { mensaje: datos?.message ?? ENLACE_INVALIDO };
    }

    // La contraseña se guarda recién con la cuenta activa: un enlace que no
    // corresponde no deja una contraseña en una identidad sin cuenta.
    const cambio = await supabase.auth.updateUser({ password: contrasena });
    if (cambio.error) {
      return cambio.error.code === "weak_password"
        ? {
            errores: {
              contrasena: `Usa una contraseña más segura, de al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`,
            },
          }
        : { mensaje: LOGIN_SIN_CONEXION };
    }

    // Mismo destino que el inicio de sesión (PB-004): Convivencia configura
    // primero su segundo factor y cada perfil llega a su portal.
    const consulta = await consultarCuentaActiva(supabase);
    if (consulta.estado !== "activa") return { mensaje: LOGIN_SIN_CONEXION };
    destino = consulta.cuenta.segundo_factor_pendiente
      ? "/verificar-segundo-factor"
      : destinoDelPerfil(consulta.cuenta.codigo_perfil);
  } catch {
    // No devolver contraseñas, tokens ni mensajes internos del proveedor de autenticación.
    return { mensaje: LOGIN_SIN_CONEXION };
  }
  // redirect interrumpe la acción: debe quedar fuera del manejo de errores.
  redirect(destino);
}
