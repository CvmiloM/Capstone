import { responderDescarga } from "@/app/components/evidencias/datos";

// PB-066 (HU-057 CA3): descarga de una evidencia desde el portal de
// Convivencia (/convivencia/evidencias/id). La API vuelve a comprobar el
// perfil, el segundo factor y la escuela antes de entregar el archivo.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id))
    return new Response("La evidencia no existe.", { status: 404 });
  const vista = new URL(peticion.url).searchParams.get("vista") === "1";
  return responderDescarga(`/convivencia/evidencias/${id}/archivo`, undefined, vista ? "imagen" : false);
}
