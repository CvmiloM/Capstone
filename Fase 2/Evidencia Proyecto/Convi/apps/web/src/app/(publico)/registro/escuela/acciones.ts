"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type EstadoEscuela = {
  /** Error general (sesión, cuenta ya existente, sin conexión). */
  mensaje?: string;
  /** Error por campo, con la clave igual al `name` del campo. */
  errores?: Record<string, string>;
  /** Valores enviados, para no vaciar el formulario si hay errores. */
  valores?: Record<string, string>;
};

const CAMPOS = [
  "nombre",
  "codigo",
  "region",
  "comuna",
  "direccion",
  "telefono_escuela",
  "correo_contacto",
  "zona_horaria",
] as const;

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";
const SIN_SESION =
  "Tu sesión terminó. Abre de nuevo el enlace de tu correo o inicia sesión para continuar.";
const SIN_CONEXION =
  "No pudimos crear el establecimiento. Inténtalo de nuevo en unos minutos.";

function texto(valor: unknown) {
  return typeof valor === "string" ? valor.trim() : "";
}

export async function crearEscuela(
  _anterior: EstadoEscuela,
  formData: FormData,
): Promise<EstadoEscuela> {
  const valores: Record<string, string> = {};
  for (const campo of CAMPOS) valores[campo] = texto(formData.get(campo));
  if (!valores.nombre) {
    return {
      errores: { nombre: "Ingresa el nombre del establecimiento." },
      valores,
    };
  }

  // La identidad y la ficha (nombres, apellidos y teléfono guardados en PB-001)
  // salen de la sesión de Supabase en el servidor, nunca del formulario.
  const supabase = await crearClienteServidor();
  const { data: usuario, error } = await supabase.auth.getUser();
  if (error || !usuario.user) return { mensaje: SIN_SESION, valores };
  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion.session?.access_token;
  if (!token) return { mensaje: SIN_SESION, valores };
  const ficha = usuario.user.user_metadata ?? {};

  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}/registro/escuela`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...valores,
        nombres: texto(ficha.nombres),
        apellidos: texto(ficha.apellidos),
        telefono: texto(ficha.telefono),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { mensaje: SIN_CONEXION, valores };
  }

  // HU-002 CA6: el administrador configura su segundo factor antes de usar el
  // portal (PB-008). Reintentar con la misma cuenta también llega aquí.
  if (respuesta.ok) redirect("/segundo-factor");

  const cuerpo = await respuesta.json().catch(() => null);
  if (respuesta.status === 400 && cuerpo?.errores) {
    const errores: Record<string, string> = {};
    for (const campo of CAMPOS) {
      if (cuerpo.errores[campo]) errores[campo] = cuerpo.errores[campo];
    }
    // La cuenta se creó sin la ficha de PB-001 (por ejemplo, desde Studio).
    if (cuerpo.errores.nombres || cuerpo.errores.apellidos) {
      return {
        mensaje:
          "Tu cuenta no tiene nombres y apellidos registrados. Regístrate de nuevo desde el inicio.",
        errores,
        valores,
      };
    }
    return { errores, valores };
  }
  if (respuesta.status === 401) return { mensaje: SIN_SESION, valores };
  if (respuesta.status === 403) {
    return {
      mensaje: "Verifica tu correo antes de registrar tu establecimiento.",
      valores,
    };
  }
  // 409: la cuenta ya pertenece a otra escuela; la API explica qué hacer.
  if (respuesta.status === 409) {
    return { mensaje: texto(cuerpo?.message) || SIN_CONEXION, valores };
  }
  return { mensaje: SIN_CONEXION, valores };
}