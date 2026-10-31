import { responderDescarga } from "@/app/components/evidencias/datos";

// PB-067 (HU-058 CA2): descarga del respaldo de una comunicación desde el
// portal de Convivencia (/convivencia/comunicaciones/id/respaldo). La API
// vuelve a comprobar el perfil, el segundo factor y la escuela.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id))
    return new Response("El respaldo no existe.", { status: 404 });
  return responderDescarga(`/convivencia/comunicaciones/${id}/respaldo`);
}
