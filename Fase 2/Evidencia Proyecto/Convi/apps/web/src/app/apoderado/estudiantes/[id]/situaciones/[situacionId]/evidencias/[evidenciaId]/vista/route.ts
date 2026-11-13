import { responderDescarga } from "@/app/components/evidencias/datos";

// Vista previa de una imagen de una situación: la API solo la entrega si es
// JPG, PNG o WEBP, y se muestra sin scripts (política de seguridad de la vista).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string; situacionId: string; evidenciaId: string }> }) {
  const { id, situacionId, evidenciaId } = await params;
  if (![id, situacionId, evidenciaId].every(v => UUID.test(v))) return new Response("La imagen no está disponible", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return responderDescarga(`/apoderado/estudiantes/${id}/situaciones/${situacionId}/evidencias/${evidenciaId}/vista`, "La imagen no está disponible o no tiene vista previa.", true);
}
