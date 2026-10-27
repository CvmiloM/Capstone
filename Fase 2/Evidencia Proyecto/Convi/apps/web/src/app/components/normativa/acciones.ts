"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// PB-117 a PB-119 (HU-101 y HU-102): la pregunta va a la API, que busca en el
// reglamento publicado de la escuela, le pide la respuesta a la IA y valida las citas.

const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Misma forma que devuelve apps/api/src/modules/normativa/consulta.ts.
export type Cita = {
  numero: number;
  documento_id: string;
  version_id: string;
  documento: string;
  version: string;
  pagina_desde: number | null;
  pagina_hasta: number | null;
  extracto: string;
};

export type Respuesta = {
  solicitud_id: string;
  sin_disposicion: boolean;
  respuesta: string;
  citas: Cita[];
};

export type EstadoConsulta = {
  pregunta?: string;
  resultado?: Respuesta;
  mensaje?: string;
  errores?: Record<string, string>;
};

const SIN_CONEXION =
  "No pudimos hacer la consulta, inténtalo de nuevo en unos minutos.";

export async function consultarReglamento(
  _anterior: EstadoConsulta,
  formData: FormData,
): Promise<EstadoConsulta> {
  const valor = formData.get("pregunta");
  const pregunta = typeof valor === "string" ? valor.trim() : "";
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) redirect("/login");

  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}/normativa/consultas`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pregunta }),
      cache: "no-store",
      // La primera consulta del día puede tardar mientras se carga el modelo.
      signal: AbortSignal.timeout(130000),
    });
  } catch {
    return { pregunta, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) redirect("/login");

  const datos = (await respuesta.json().catch(() => null)) as
    | (Respuesta & {
        mensaje?: string;
        message?: string;
        errores?: Record<string, string>;
      })
    | null;
  if (respuesta.ok && datos && typeof datos.respuesta === "string")
    return { pregunta, resultado: datos };
  if (respuesta.status === 400 && datos?.errores)
    return {
      pregunta,
      mensaje: datos.mensaje ?? "Revisa la pregunta.",
      errores: datos.errores,
    };
  // HU-113: si la IA no está disponible la API lo explica, y el resto de CONVI sigue igual.
  if ([403, 503].includes(respuesta.status) && datos?.message)
    return { pregunta, mensaje: datos.message };
  return { pregunta, mensaje: SIN_CONEXION };
}
