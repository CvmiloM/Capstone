"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { enviar } from "../../datos";
import type { EstadoAccion } from "./acciones";

// PB-151 (HU-130) y PB-086 (HU-075): borradores de correo al apoderado. La API
// vuelve a validar todo y ninguna de estas acciones envía el correo (PB-087).
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDO = "El caso no es válido. Vuelve a la lista de casos.";
const SIN_CONEXION =
  "No pudimos preparar el borrador, inténtalo de nuevo en unos minutos o redáctalo a mano.";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

const volver = (casoId: string, aviso: string) =>
  redirect(
    `/convivencia/casos/${casoId}?seccion=comunicaciones&aviso=${aviso}#correos`,
  );

// HU-130: guarda un borrador nuevo o los cambios de uno existente.
export async function guardarCorreo(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const correoId = leerTexto(formData, "correo_id");
  const valores = {
    persona_destinataria_id: leerTexto(formData, "persona_destinataria_id"),
    direccion: leerTexto(formData, "direccion"),
    asunto: leerTexto(formData, "asunto"),
    contenido: leerTexto(formData, "contenido"),
  };
  if (!UUID.test(casoId) || (correoId && !UUID.test(correoId)))
    return { mensaje: NO_VALIDO, valores };
  const resultado = await enviar(
    "POST",
    correoId
      ? `/convivencia/correos/${correoId}`
      : `/convivencia/casos/${casoId}/correos`,
    {
      persona_destinataria_id: valores.persona_destinataria_id || undefined,
      direccion: valores.direccion || undefined,
      asunto: valores.asunto,
      contenido: valores.contenido,
    },
  );
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, correoId ? "correo-editado" : "correo");
  return {};
}

// Decisión del PO (2026-10-31): un borrador sin confirmar se puede descartar.
export async function descartarCorreo(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const correoId = leerTexto(formData, "correo_id");
  if (!UUID.test(casoId) || !UUID.test(correoId)) return { mensaje: NO_VALIDO };
  const resultado = await enviar(
    "POST",
    `/convivencia/correos/${correoId}/descarte`,
  );
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  volver(casoId, "correo-descartado");
  return {};
}

// HU-075: la IA redacta el borrador. Se llama directo para mostrar el mensaje
// de la API cuando la IA no está disponible (503) o el texto no cumplió las
// reglas (409), sin perder la indicación escrita.
export async function prepararCorreoConIA(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const valores = {
    persona_destinataria_id: leerTexto(formData, "persona_destinataria_id"),
    indicacion: leerTexto(formData, "indicacion"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) redirect("/login");

  let respuesta: Response;
  try {
    respuesta = await fetch(
      `${URL_API}/convivencia/casos/${encodeURIComponent(casoId)}/correos/ia`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(valores),
        cache: "no-store",
        // La primera solicitud del día puede tardar mientras se carga el modelo.
        signal: AbortSignal.timeout(130000),
      },
    );
  } catch {
    return { mensaje: SIN_CONEXION, valores };
  }
  if (respuesta.status === 401) redirect("/login");
  const datos = (await respuesta.json().catch(() => null)) as {
    id?: string;
    mensaje?: string;
    message?: string;
    errores?: Record<string, string>;
  } | null;
  if (respuesta.ok && datos?.id) volver(casoId, "correo-ia");
  if (respuesta.status === 400 && datos?.errores)
    return {
      mensaje: datos.mensaje ?? "Revisa los datos marcados.",
      errores: datos.errores,
      valores,
    };
  if ([403, 404, 409, 503].includes(respuesta.status) && datos?.message)
    return { mensaje: datos.message, valores };
  return { mensaje: SIN_CONEXION, valores };
}
