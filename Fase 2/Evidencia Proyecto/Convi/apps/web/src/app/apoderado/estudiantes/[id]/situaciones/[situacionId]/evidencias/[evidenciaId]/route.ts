import { responderDescarga } from "@/app/components/evidencias/datos";

// Descarga de un archivo de una situación del pupilo, la API vuelve a comprobar
// la cuenta, el permiso y que el archivo sea de esa situación.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string; situacionId: string; evidenciaId: string }> }) {
  const { id, situacionId, evidenciaId } = await params;
  if (![id, situacionId, evidenciaId].every(v => UUID.test(v))) return new Response("La evidencia no está disponible", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return responderDescarga(`/apoderado/estudiantes/${id}/situaciones/${situacionId}/evidencias/${evidenciaId}/archivo`);
}
