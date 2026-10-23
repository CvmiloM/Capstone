import { responderDescarga } from "@/app/components/evidencias/datos";

// PB-066 (HU-057 CA3): descarga de una evidencia desde el portal del profesor
// (/profesor/evidencias/id). La API solo entrega lo que el profesor aportó a
// sus propias situaciones.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id))
    return new Response("La evidencia no existe.", { status: 404 });
  return responderDescarga(`/profesor/evidencias/${id}/archivo`);
}
