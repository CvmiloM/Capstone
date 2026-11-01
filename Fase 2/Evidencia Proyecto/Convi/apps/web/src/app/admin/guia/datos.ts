import "server-only";
import { pedirAdmin } from "../datos";
import { enviarCambio } from "../estudiantes/datos";
import type { ClavePaso } from "./opciones";

// PB-032, PB-034 y PB-038: datos de la guía inicial. Misma forma que devuelve
// apps/api/src/modules/admin/guia.service.ts.

export type PasoGuia = {
  clave: ClavePaso;
  estado: "PENDIENTE" | "LISTO" | "OMITIDO";
  en: string | null;
  por_nombre: string | null;
};

export type Guia = {
  iniciada: boolean;
  pasos: PasoGuia[];
  /** HU-031 CA2: el primer paso pendiente, donde se retoma. */
  paso_actual: ClavePaso;
  bienvenida: { otro: string | null; mejorar: string | null };
  terminada_en: string | null;
  metodo_registro_actual: string | null;
  /** Huella de lo que se ve, para PB-139. */
  version: string;
  zona_horaria: string;
  academico: {
    anios: { id: string; anio: number; estado: string }[];
    niveles: { nombre: string; ciclo: string; activo: boolean }[];
    cursos: {
      anio: number;
      nivel: string;
      ciclo: string;
      seccion: string | null;
    }[];
  };
};

export async function obtenerGuia(): Promise<Guia> {
  const respuesta = await pedirAdmin("/admin/guia");
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return respuesta.json();
}

export function enviarInicioGuia(version: string) {
  return enviarCambio("POST", "/admin/guia/inicio", { version });
}

export function enviarBienvenida(cuerpo: Record<string, string>) {
  return enviarCambio("POST", "/admin/guia/bienvenida", cuerpo);
}

export function enviarOmision(paso: ClavePaso, version: string) {
  return enviarCambio(
    "POST",
    `/admin/guia/pasos/${encodeURIComponent(paso)}/omision`,
    { version },
  );
}

export function enviarCursosGuia(cuerpo: unknown) {
  return enviarCambio("POST", "/admin/guia/cursos", cuerpo);
}
