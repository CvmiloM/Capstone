"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// PB-120 y PB-121 (HU-103): la API junta el expediente, oculta los nombres con
// seudónimos, busca en el reglamento y le pide la orientación a la IA.

const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Misma forma que devuelve apps/api/src/modules/orientacion/orientacion.ts.
export type ReferenciaOrientacion = {
  id: string;
  tipo: "EXPEDIENTE" | "REGLAMENTO" | "PROTOCOLO";
  etiqueta: string;
  enlace: string | null;
  extracto: string | null;
};

export type ElementoOrientacion = { texto: string; referencias: string[] };

export type Orientacion = {
  solicitud_id: string;
  sin_disposicion: boolean;
  fuera_de_limite: boolean;
  texto_sin_disposicion: string | null;
  /** Respuesta directa a la pregunta puntual, con sus citas. */
  respuesta: ElementoOrientacion | null;
  hechos: ElementoOrientacion[];
  pasos: ElementoOrientacion[];
  referencias: ReferenciaOrientacion[];
  seudonimos: {
    alias: string;
    nombre: string;
    detalle: string;
    en_caso: boolean;
  }[];
  descartados: number;
};

export type EstadoOrientacion = {
  pregunta?: string;
  resultado?: Orientacion;
  mensaje?: string;
  errores?: Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_CONEXION =
  "No pudimos pedir la orientación, inténtalo de nuevo en unos minutos.";

export async function orientarCaso(
  casoId: string,
  _anterior: EstadoOrientacion,
  formData: FormData,
): Promise<EstadoOrientacion> {
  const valor = formData.get("pregunta");
  const pregunta = typeof valor === "string" ? valor.trim() : "";
  if (!UUID.test(casoId))
    return {
      pregunta,
      mensaje: "El caso no es válido. Vuelve a la lista de casos.",
    };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) redirect("/login");

  let respuesta: Response;
  try {
    respuesta = await fetch(
      `${URL_API}/convivencia/casos/${encodeURIComponent(casoId)}/orientacion`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pregunta ? { pregunta } : {}),
        cache: "no-store",
        // La primera solicitud del día puede tardar mientras se carga el modelo.
        signal: AbortSignal.timeout(130000),
      },
    );
  } catch {
    return { pregunta, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) redirect("/login");

  const datos = (await respuesta.json().catch(() => null)) as
    | (Orientacion & {
        mensaje?: string;
        message?: string;
        errores?: Record<string, string>;
      })
    | null;
  if (respuesta.ok && datos && Array.isArray(datos.pasos))
    return { pregunta, resultado: datos };
  if (respuesta.status === 400 && datos?.errores)
    return {
      pregunta,
      mensaje: datos.mensaje ?? "Revisa la pregunta.",
      errores: datos.errores,
    };
  // HU-113: si la IA no está disponible la API lo explica y el caso sigue igual.
  if ([403, 404, 503].includes(respuesta.status) && datos?.message)
    return { pregunta, mensaje: datos.message };
  return { pregunta, mensaje: SIN_CONEXION };
}
