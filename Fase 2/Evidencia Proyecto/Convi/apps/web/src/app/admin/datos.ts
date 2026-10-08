import { cache } from "react";

// Datos del portal de administración. Mientras no exista la API, estas
// funciones devuelven datos de ejemplo con la misma forma que tendrá la
// respuesta real; la conexión con el backend está marcada con TODO.
// Los comentarios indican de qué tablas del modelo de datos sale cada campo.

/** Lo que todas las pantallas del portal necesitan saber de la sesión. */
export type ContextoAdmin = {
  /** establecimientos */
  escuela: {
    nombre: string;
    codigo: string | null;
    comuna: string | null;
    /** establecimientos.zona_horaria: con ella se muestran las fechas (HU-021). */
    zonaHoraria: string;
  };
  /** anios_academicos: el año en estado Activo más reciente, si existe. */
  anioActivo: { anio: number } | null;
  /** personas: la persona de la membresía que inició sesión. */
  usuario: { nombres: string; apellidos: string };
};

// cache() hace que el layout y la página compartan la misma respuesta cuando
// ambos piden el contexto durante una misma solicitud.
export const obtenerContextoAdmin = cache(async (): Promise<ContextoAdmin> => {
  // TODO(HU-004, HU-108): leer la sesión de Supabase Auth y pedir al backend
  // la membresía. Si no hay sesión, si el perfil no es ADMIN, si la cuenta no
  // está ACTIVO o si falta el segundo factor, redirigir a /login.
  return {
    escuela: {
      nombre: "Liceo Bicentenario Los Aromos",
      codigo: "12847-1",
      comuna: "Cabrero",
      zonaHoraria: "America/Santiago",
    },
    anioActivo: { anio: 2026 },
    usuario: { nombres: "Manuel", apellidos: "Reyes Olivares" },
  };
});

/** Las ocho cifras de la HU-033, calculadas con datos de la escuela de la sesión. */
export type ResumenEscuela = {
  /** "ejemplo" mientras la pantalla no esté conectada con el backend. */
  origen: "backend" | "ejemplo";
  /** Momento en que el backend calculó las cifras (ISO 8601). */
  calculadoEn: string;
  /** membresias_establecimiento en estado ACTIVO, de todos los perfiles. */
  cuentasActivas: number;
  /** Membresías con perfil PROFESOR: todas las registradas y las ACTIVO. */
  profesores: { registrados: number; activos: number };
  /** Membresías con perfil CONVIVENCIA: todas las registradas y las ACTIVO. */
  convivencia: { registrados: number; activos: number };
  /** cursos y matriculas vigentes del año activo; null si no hay año activo. */
  anioActivo: { anio: number; cursos: number; matriculas: number } | null;
  /** accesos_apoderado ACTIVO y no vencidos, un acceso por apoderado y estudiante. */
  accesosApoderado: number;
  /** versiones_protocolo publicadas y dentro de su vigencia. */
  protocolosVigentes: number;
  /** reglas en estado ACTIVO (reglas guardadas, no alertas generadas). */
  reglasActivas: number;
};

export async function obtenerResumen(): Promise<ResumenEscuela> {
  // TODO(HU-033): pedir las cifras al backend (por ejemplo GET /admin/resumen).
  // El backend las calcula con la escuela de la sesión y nunca lee
  // situaciones, casos ni expedientes (HU-123).
  return {
    origen: "ejemplo",
    calculadoEn: "2026-10-07T10:14:00-03:00",
    cuentasActivas: 48,
    profesores: { registrados: 39, activos: 38 },
    convivencia: { registrados: 6, activos: 6 },
    anioActivo: { anio: 2026, cursos: 24, matriculas: 842 },
    accesosApoderado: 791,
    protocolosVigentes: 8,
    reglasActivas: 14,
  };
}
