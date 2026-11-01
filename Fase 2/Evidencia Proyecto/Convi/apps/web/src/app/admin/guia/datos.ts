import "server-only";
import { pedirAdmin } from "../datos";
import { enviarCambio } from "../estudiantes/datos";
import type { ClavePaso } from "./opciones";

// PB-032 a PB-034, PB-036 y PB-038: datos de la guía inicial. Misma forma que devuelve
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
    anios: {
      id: string;
      anio: number;
      estado: string;
      /** AAAA-MM-DD; null si el año no la tiene. */
      fecha_inicio: string | null;
    }[];
    niveles: { nombre: string; ciclo: string; activo: boolean }[];
    cursos: {
      anio: number;
      nivel: string;
      ciclo: string;
      seccion: string | null;
      codigo: string;
      nombre: string;
    }[];
  };
  /** PB-036: las importaciones de estudiantes de la escuela. */
  estudiantes: {
    /** Las 5 más recientes. */
    importaciones: {
      id: string;
      estado: string;
      archivo_nombre: string;
      /** Fecha y hora ISO. */
      creado_en: string;
      filas: number;
      confirmadas: number;
    }[];
    /** Filas de estudiantes confirmadas en todas las importaciones. */
    confirmados: number;
  };
  /** PB-033: las cuentas de Convivencia y de profesores. */
  equipo: {
    /** Las 20 invitadas más recientes. */
    cuentas: {
      id: string;
      nombre: string;
      correo: string | null;
      perfil: "CONVIVENCIA" | "PROFESOR";
      estado: string;
      /** Fecha y hora ISO; null en cuentas sin invitación registrada. */
      invitado_en: string | null;
    }[];
    /** Cuentas Pendientes o Activas, las que cuentan para el paso. */
    total: number;
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

/** PB-033 y PB-036: deja Listo el paso Equipo o Estudiantes. */
export function enviarPasoListo(
  paso: "equipo" | "estudiantes",
  version: string,
) {
  return enviarCambio("POST", `/admin/guia/${paso}`, { version });
}
