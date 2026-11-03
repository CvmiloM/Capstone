import "server-only";
import { pedirAdmin } from "../datos";
import { enviarCambio } from "../estudiantes/datos";
import type { ClavePaso, PasoDelPortal } from "./opciones";

// PB-032 a PB-039: datos de la guía inicial. Misma forma que devuelve
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

/** PB-039 (HU-032 CA1): las cifras del paso Resumen y fin. */
export type ResumenGuia = {
  /** Fecha y hora ISO en que se calcularon. */
  calculado_en: string;
  /** Invitaciones enviadas que esperan aceptación y cuentas que ya aceptaron. */
  equipo: Record<
    "CONVIVENCIA" | "PROFESOR",
    { pendientes: number; activas: number }
  >;
  /** El año activo o, si no hay, el planificado más reciente. */
  anio: { anio: number; estado: string; cursos: number } | null;
  niveles_activos: number;
  /** Versiones no archivadas del reglamento (RICE). */
  reglamento: {
    cargadas: number;
    publicadas_vigentes: number;
    lista: number;
    en_proceso: number;
    fallida: number;
  };
  estudiantes_confirmados: number;
  categorias_activas: number;
  /** Reglas guardadas, no alertas generadas. */
  reglas: { activas: number; borradores: number };
};

export async function obtenerGuia(): Promise<Guia> {
  const respuesta = await pedirAdmin("/admin/guia");
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return respuesta.json();
}

export async function obtenerResumenGuia(): Promise<ResumenGuia> {
  const respuesta = await pedirAdmin("/admin/guia/resumen");
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  return respuesta.json();
}

/** PB-039: termina la guía; si ya terminó, la API responde igual. */
export function enviarTermino(version: string) {
  return enviarCambio("POST", "/admin/guia/fin", { version });
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

/** PB-033 y PB-035 a PB-037: deja Listo un paso hecho en el portal. */
export function enviarPasoListo(paso: PasoDelPortal, version: string) {
  return enviarCambio("POST", `/admin/guia/${paso}`, { version });
}
