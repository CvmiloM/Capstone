import { pedirAvance } from "../../datos";

// PB-027 (HU-020 CA5): el avance de una importación que se está confirmando
// (/admin/importaciones/:id/avance). La pantalla lo pide cada 2 segundos; aquí
// solo se agrega el token de la sesión, que el navegador no tiene.
export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const respuesta = await pedirAvance(id);
  if (!respuesta.ok)
    return Response.json(
      { mensaje: "No pudimos consultar el avance." },
      {
        status: respuesta.status === 404 ? 404 : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  return Response.json(await respuesta.json(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}