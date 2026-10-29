import { responderDescarga } from "@/app/components/evidencias/datos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string; casoId: string; evidenciaId: string }> }) {
  const { id, casoId, evidenciaId } = await params;
  if (![id, casoId, evidenciaId].every(v => UUID.test(v))) return new Response("La evidencia no está disponible", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return responderDescarga(`/apoderado/estudiantes/${id}/casos/${casoId}/evidencias/${evidenciaId}/archivo`);
}
