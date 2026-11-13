import { responderDescarga } from "@/app/components/evidencias/datos";

// Vista previa de una imagen de un caso, con los mismos controles que su descarga.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string; casoId: string; evidenciaId: string }> }) {
  const { id, casoId, evidenciaId } = await params;
  if (![id, casoId, evidenciaId].every(v => UUID.test(v))) return new Response("La imagen no está disponible", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return responderDescarga(`/apoderado/estudiantes/${id}/casos/${casoId}/evidencias/${evidenciaId}/vista`, "La imagen no está disponible o no tiene vista previa.", true);
}
