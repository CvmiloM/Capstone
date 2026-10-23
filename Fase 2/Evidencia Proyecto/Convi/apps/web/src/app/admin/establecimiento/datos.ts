import "server-only";
import { pedirAdmin } from "../datos";

export type FichaInstitucional = {
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  telefono: string | null;
  correo_contacto: string | null;
  region: string | null;
  comuna: string | null;
  creado_en: string;
  actualizado_en: string;
  zona_horaria: string;
};

export async function obtenerFichaInstitucional(): Promise<FichaInstitucional> {
  const respuesta = await pedirAdmin("/admin/establecimiento");
  if (!respuesta.ok)
    throw new Error("No pudimos consultar la ficha institucional");
  return respuesta.json();
}
