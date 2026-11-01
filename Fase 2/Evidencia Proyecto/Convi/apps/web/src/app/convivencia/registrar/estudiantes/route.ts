import { NextRequest, NextResponse } from "next/server";
import { pedir } from "../../datos";

export async function GET(request: NextRequest) {
  const consulta = new URLSearchParams();
  for (const campo of ["buscar", "curso", "historico"])
    consulta.set(campo, request.nextUrl.searchParams.get(campo) || "");
  const respuesta = await pedir(
    `/convivencia/registro/estudiantes?${consulta}`,
  );
  return respuesta.ok
    ? NextResponse.json(respuesta.datos)
    : NextResponse.json(
        { mensaje: "No pudimos buscar estudiantes, intenta nuevamente" },
        { status: 503 },
      );
}
