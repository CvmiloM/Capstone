"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoAccion } from "./acciones";

// PB-124 (HU-105): la API busca en el reglamento, le pide a la IA los pasos y
// guarda la propuesta como protocolo no oficial en borrador. Después se revisa
// y publica en Protocolos, como cualquier versión.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_CONEXION =
  "No pudimos preparar la propuesta, inténtalo de nuevo en unos minutos o prepara el protocolo a mano en Protocolos";

export async function pedirPropuestaProtocolo(
  casoId: string,
): Promise<EstadoAccion> {
  if (!UUID.test(casoId))
    return { mensaje: "El caso no es válido, vuelve a la lista de casos" };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) redirect("/login");

  let respuesta: Response;
  try {
    respuesta = await fetch(
      `${URL_API}/convivencia/casos/${encodeURIComponent(casoId)}/propuesta-protocolo`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        // La primera solicitud del día puede tardar mientras se carga el modelo.
        signal: AbortSignal.timeout(130000),
      },
    );
  } catch {
    return { mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) redirect("/login");
  const datos = (await respuesta.json().catch(() => null)) as {
    version_id?: string;
    message?: string;
  } | null;
  if (respuesta.ok && datos?.version_id && UUID.test(datos.version_id))
    redirect(
      `/convivencia/protocolos/versiones/${datos.version_id}?aviso=propuesta`,
    );
  // HU-113: si la IA no está disponible o la propuesta no cumplió las reglas,
  // la API lo explica y el caso sigue igual.
  if ([403, 404, 409, 503].includes(respuesta.status) && datos?.message)
    return { mensaje: datos.message };
  return { mensaje: SIN_CONEXION };
}
