"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { enviar } from "../../datos";
import type { EstadoAccion } from "./acciones";

// PB-125 y PB-126 (HU-106 y HU-107): borradores de acta y de informe de caso con
// IA. La API vuelve a validar todo, y ninguna de estas acciones firma un acta,
// agrega una evidencia ni publica un informe.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDO = "El borrador no es válido, recarga la página";
const SIN_CONEXION =
  "No pudimos preparar el borrador, inténtalo de nuevo en unos minutos o redacta el documento a mano";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

const volver = (casoId: string, aviso: string) =>
  redirect(`/convivencia/casos/${casoId}?seccion=ia&aviso=${aviso}#borradores`);

// La IA redacta el borrador. Se llama directo para esperar al modelo y mostrar
// el mensaje de la API si la IA no está disponible (503) o el texto no cumplió
// las reglas (409).
export async function pedirBorrador(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const valores = {
    tipo: leerTexto(formData, "tipo"),
    actuacion_id: leerTexto(formData, "actuacion_id"),
  };
  if (!UUID.test(casoId)) return { mensaje: NO_VALIDO, valores };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) redirect("/login");

  let respuesta: Response;
  try {
    respuesta = await fetch(
      `${URL_API}/convivencia/casos/${encodeURIComponent(casoId)}/borradores`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tipo: valores.tipo,
          ...(valores.tipo === "ACTA" && valores.actuacion_id
            ? { actuacion_id: valores.actuacion_id }
            : {}),
        }),
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
  if (respuesta.ok && datos?.id) volver(casoId, "borrador-ia");
  if (respuesta.status === 400 && datos?.errores)
    return {
      mensaje: datos.mensaje ?? "Revisa los datos marcados",
      errores: datos.errores,
      valores,
    };
  if ([403, 404, 409, 503].includes(respuesta.status) && datos?.message)
    return { mensaje: datos.message, valores };
  return { mensaje: SIN_CONEXION, valores };
}

// HU-106 CA2 y HU-107 CA2: corregir el texto crea otra edición.
export async function editarBorrador(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const borradorId = leerTexto(formData, "borrador_id");
  const valores = {
    titulo: leerTexto(formData, "titulo"),
    contenido: leerTexto(formData, "contenido"),
  };
  if (!UUID.test(casoId) || !UUID.test(borradorId))
    return { mensaje: NO_VALIDO, valores };
  const resultado = await enviar(
    "POST",
    `/convivencia/borradores/${borradorId}/edicion`,
    { ...valores, version: leerTexto(formData, "version") },
  );
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  volver(casoId, "borrador-editado");
  return {};
}

// Revisado o Descartado, con la huella de lo que se veía (PB-139).
export async function revisarBorrador(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const borradorId = leerTexto(formData, "borrador_id");
  const estado = leerTexto(formData, "estado_nuevo");
  if (!UUID.test(casoId) || !UUID.test(borradorId)) return { mensaje: NO_VALIDO };
  const resultado = await enviar(
    "POST",
    `/convivencia/borradores/${borradorId}/revision`,
    { estado_nuevo: estado, version: leerTexto(formData, "version") },
  );
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  volver(
    casoId,
    estado === "DESCARTADO" ? "borrador-descartado" : "borrador-revisado",
  );
  return {};
}
