import { pedirAdmin } from "../datos";

export type ResumenAccesoPortal = {
  cuenta_id: string | null;
  perfil_cuenta: string | null;
  estado_cuenta: string | null;
  correo_cuenta: string | null;
  acceso_id: string | null;
  estado_acceso: string | null;
  expira_en: string | null;
  vence_el: string | null;
  otorgado_en: string | null;
  revocado_en: string | null;
  acceso_habilitado: boolean;
};

export type FilaApoderado = ResumenAccesoPortal & {
  id: string;
  estudiante_id: string;
  estudiante_nombre: string;
  codigo_estudiante: string;
  apoderado_nombre: string;
  correo: string | null;
  tipo_relacion: string | null;
};

export async function obtenerAccesosApoderados(buscar: string, pagina: number) {
  const respuesta = await pedirAdmin(`/admin/apoderados?${new URLSearchParams({ buscar, pagina: String(pagina) })}`);
  if (!respuesta.ok) throw new Error("No pudimos consultar los accesos de apoderados");
  return await respuesta.json() as { apoderados: FilaApoderado[]; total: number; pagina: number; por_pagina: number };
}
