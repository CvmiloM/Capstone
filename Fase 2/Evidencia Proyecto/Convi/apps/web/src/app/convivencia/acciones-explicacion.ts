"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// PB-122 y PB-123 (HU-104): la API arma los valores calculados, se los entrega a
// la IA sin nombres y revisa el texto antes de devolverlo. Nada de esto cambia la
// alerta ni los indicadores.

const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Misma forma que devuelve apps/api/src/modules/orientacion/explicar-con-ia.ts.
export type ValorExplicado = { nombre: string; valor: string; detalle?: string };

export type Explicacion = {
  solicitud_id: string | null;
  generado_por_ia: boolean;
  parrafos: string[];
  valores: ValorExplicado[];
};

export type EstadoExplicacion = { resultado?: Explicacion; mensaje?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const SIN_CONEXION =
  "No pudimos pedir la explicación, inténtalo de nuevo en unos minutos";

async function pedirExplicacion(
  ruta: string,
  cuerpo: unknown,
): Promise<EstadoExplicacion> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) redirect("/login");

  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
      // La primera solicitud del día puede tardar mientras se carga el modelo.
      signal: AbortSignal.timeout(130000),
    });
  } catch {
    return { mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) redirect("/login");

  const datos = (await respuesta.json().catch(() => null)) as
    | (Explicacion & { message?: string | string[] })
    | null;
  if (respuesta.ok && datos && Array.isArray(datos.parrafos))
    return { resultado: datos };
  // HU-113: si la IA no está disponible o el texto no se pudo mostrar, la API
  // lo explica y los valores calculados siguen en la pantalla.
  if ([400, 403, 404, 409, 503].includes(respuesta.status) && datos?.message)
    return {
      mensaje: Array.isArray(datos.message)
        ? datos.message.join(", ")
        : datos.message,
    };
  return { mensaje: SIN_CONEXION };
}

export async function explicarAlerta(
  alertaId: string,
): Promise<EstadoExplicacion> {
  if (!UUID.test(alertaId))
    return { mensaje: "La alerta no es válida, vuelve a la bandeja" };
  return pedirExplicacion(
    `/convivencia/alertas/${encodeURIComponent(alertaId)}/explicacion`,
    {},
  );
}

export async function explicarComparacion(
  filtros: { desde: string; hasta: string; curso: string; categoria: string },
): Promise<EstadoExplicacion> {
  if (!FECHA.test(filtros.desde) || !FECHA.test(filtros.hasta))
    return { mensaje: "Elige un período antes de pedir la explicación" };
  return pedirExplicacion("/convivencia/indicadores/comparacion/explicacion", {
    desde: filtros.desde,
    hasta: filtros.hasta,
    ...(UUID.test(filtros.curso) ? { curso: filtros.curso } : {}),
    ...(UUID.test(filtros.categoria) ? { categoria: filtros.categoria } : {}),
  });
}
