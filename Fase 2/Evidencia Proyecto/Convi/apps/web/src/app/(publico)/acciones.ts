"use server";

import { LARGO_MAXIMO, LARGO_MINIMO_CONTRASENA } from "./limites";

// Acciones de los formularios públicos. Por ahora solo validan los datos en el
// servidor: la conexión con Supabase Auth y con el backend está marcada con TODO.

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
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_CONEXION = "Este formulario todavía no está conectado con Supabase Auth.";
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
  const correo = leerTexto(formData, "correo").toLowerCase();
  const contrasena = leerContrasena(formData, "contrasena");
  const valores = { correo };
  const errores: Record<string, string> = {};

  validarCorreo(correo, errores);
  if (!contrasena) errores.contrasena = "Ingresa tu contraseña.";
  if (Object.keys(errores).length > 0) return { errores, valores };

  // TODO(PB-004): iniciar sesión con Supabase Auth y pedir al backend la
  // membresía de esa identidad (una identidad tiene una sola cuenta en CONVI).
  // Solo entra una membresía ACTIVO de un establecimiento ACTIVO; PENDIENTE,
  // SUSPENDIDO y REVOCADO reciben el mismo mensaje genérico. ADMIN y
  // CONVIVENCIA pasan antes por el segundo factor (aal2, PB-009). Después,
  // redirigir según codigo_perfil: /admin, /convivencia, /profesor o /apoderado.
  return { mensaje: SIN_CONEXION, valores };
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

  // TODO(PB-001): crear la identidad con Supabase Auth (signUp) y enviar el
  // correo de verificación. Antes de verificar no se crea nada en CONVI, así
  // que nombres, apellidos y teléfono se guardan en los metadatos de la
  // identidad (options.data) hasta que el backend llame a
  // convi.registrar_primer_administrador junto con los datos de la escuela
  // (HU-002). La contraseña queda solo en Supabase Auth y nunca en logs.
  // Si todo sale bien, responder { exito: true, valores }.
  return { mensaje: SIN_CONEXION, valores };
}

export async function activarCuenta(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const tokenHash = leerTexto(formData, "token_hash");
  const membresia = leerTexto(formData, "membresia");
  const contrasena = leerContrasena(formData, "contrasena");
  const confirmacion = leerContrasena(formData, "confirmacion");
  const errores: Record<string, string> = {};

  if (!tokenHash || !FORMATO_UUID.test(membresia)) {
    return { mensaje: ENLACE_INVALIDO };
  }
  validarNuevaContrasena(contrasena, confirmacion, errores);
  if (Object.keys(errores).length > 0) return { errores };

  // TODO(PB-003): verificar el enlace con Supabase Auth (verifyOtp, type
  // "invite") y guardar la contraseña (updateUser). Luego el backend llama a
  // convi.activar_invitacion(membresia, identidad) con el rol convi_registro.
  // Sus errores se muestran así:
  // - "La invitación no corresponde a este correo" o "ya fue usada o no está
  //   vigente" → ENLACE_INVALIDO
  // - "Esta identidad ya tiene una cuenta en CONVI" → avisar que use otro correo
  // - "La escuela no está activa" → el establecimiento no está disponible
  // Al terminar, redirigir al portal del perfil.
  return { mensaje: SIN_CONEXION };
}
