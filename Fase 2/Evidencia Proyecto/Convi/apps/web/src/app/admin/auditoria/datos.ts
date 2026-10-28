import "server-only";
import { pedirAdmin } from "../datos";
import type { PaginaHistorial } from "@/app/components/auditoria/lista-historial";

export async function obtenerAuditoria(
  consulta: Record<string, string | string[] | undefined>,
): Promise<PaginaHistorial | null> {
  const parametros = new URLSearchParams();
  for (const [nombre, valor] of Object.entries(consulta)) {
    if (Array.isArray(valor))
      valor.forEach((v) => parametros.append(nombre, v));
    else if (valor !== undefined && valor !== "") parametros.set(nombre, valor);
  }
  const respuesta = await pedirAdmin(`/admin/auditoria?${parametros}`);
  if (respuesta.status === 400) return null;
  if (!respuesta.ok) throw new Error("No pudimos consultar la auditoría");
  return respuesta.json();
}
