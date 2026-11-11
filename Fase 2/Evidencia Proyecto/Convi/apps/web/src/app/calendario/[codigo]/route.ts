import { origenPublico } from "@/lib/origen-publico";

// Refinamientos de Convivencia, sección 5: el enlace privado del calendario
// (/calendario/código.ics) que Google Calendar consulta desde sus servidores,
// sin sesión. La web solo lo pasa a la API, que comprueba el código y entrega
// el archivo sin nombres ni descripciones.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

const CODIGO = /^[A-Za-z0-9_-]{43}$/;

const sinEnlace = () =>
  new Response("El enlace del calendario no existe o se desactivó.", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
  });

export async function GET(
  peticion: Request,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const codigo = (await params).codigo.replace(/\.ics$/, "");
  if (!CODIGO.test(codigo)) return sinEnlace();
  // Los eventos enlazan a CONVI con la misma dirección que usó Google.
  const origen = origenPublico(peticion.headers, peticion.url);
  const consulta = origen ? `?${new URLSearchParams({ origen })}` : "";
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}/calendario/suscrito/${codigo}${consulta}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return new Response("El calendario no está disponible, inténtalo más tarde.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "600" },
    });
  }
  if (respuesta.status === 404) return sinEnlace();
  if (!respuesta.ok)
    return new Response("El calendario no está disponible, inténtalo más tarde.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "600" },
    });
  return new Response(await respuesta.text(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="convi-convivencia.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
