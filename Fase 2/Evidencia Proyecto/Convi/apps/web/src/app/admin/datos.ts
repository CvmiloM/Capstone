import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { consultarCuentaActiva } from "@/lib/supabase/cuenta";

// Comprobar también donde se leen los datos: el menú o el proxy no son suficientes.
const comprobarAdministrador = cache(async () => {
  await connection();
  const consulta = await consultarCuentaActiva(await crearClienteServidor());
  if (consulta.estado === "sin-sesion") redirect("/login");
  if (consulta.estado === "bloqueada") redirect("/verificar-segundo-factor");
  if (consulta.estado === "sin-conexion")
    throw new Error("No pudimos comprobar tu acceso.");
  if (consulta.cuenta.codigo_perfil !== "ADMIN") redirect("/");
  if (consulta.cuenta.segundo_factor_pendiente)
    redirect("/verificar-segundo-factor");
});

// Dentro de Docker, localhost no es la API: el .env apunta NEXT_PUBLIC_API_URL
// a http://host.docker.internal:3001.
const URL_API =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// Cada endpoint ADMIN comprueba cuenta, escuela y MFA antes de entregar datos.
// Consultar el encabezado primero solo encadenaría dos operaciones independientes.
export async function pedirAdmin(ruta: string, espera = 10000) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) redirect("/login");
  const respuesta = await fetch(`${URL_API}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(espera),
  });
  if (respuesta.status === 401) redirect("/login");
  // Solo si se rechazó el acceso necesitamos distinguir perfil, suspensión y MFA.
  if (respuesta.status === 403) await comprobarAdministrador();
  return respuesta;
}

// Datos del portal de administración. El contexto y el resumen vienen de la API.
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
  /**
   * PB-032 y PB-038: establecimientos.onboarding_completado_en y si la guía
   * ya se empezó (contexto_onboarding). Sin empezar ni terminar, se abre sola.
   */
  guia: { terminada: boolean; iniciada: boolean };
};

// cache() hace que el layout y la página compartan la misma respuesta cuando
// ambos piden el contexto durante una misma solicitud.
export const obtenerContextoAdmin = cache(async (): Promise<ContextoAdmin> => {
  // La API toma la escuela y la persona de la sesión, nunca del navegador.
  const respuesta = await pedirAdmin("/admin/contexto");
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  // Misma forma que devuelve apps/api/src/modules/admin/contexto.service.ts.
  const contexto = (await respuesta.json()) as {
    escuela: {
      nombre: string;
      codigo: string | null;
      comuna: string | null;
      zona_horaria: string;
    };
    anio_activo: number | null;
    usuario: { nombres: string; apellidos: string };
    guia: { terminada: boolean; iniciada: boolean };
  };
  return {
    escuela: {
      nombre: contexto.escuela.nombre,
      codigo: contexto.escuela.codigo,
      comuna: contexto.escuela.comuna,
      zonaHoraria: contexto.escuela.zona_horaria,
    },
    anioActivo:
      contexto.anio_activo === null ? null : { anio: contexto.anio_activo },
    usuario: contexto.usuario,
    guia: contexto.guia,
  };
});

/** Las ocho cifras de la HU-033, calculadas con datos de la escuela de la sesión. */
export type ResumenEscuela = {
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

// PB-040: la API calcula las cifras con la escuela de la sesión y nunca lee
// situaciones, casos ni expedientes (HU-123). Si falla, error.tsx muestra el
// reintento (HU-033 CA4).
export async function obtenerResumen(): Promise<ResumenEscuela> {
  const respuesta = await pedirAdmin("/admin/resumen");
  if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
  // Misma forma que devuelve apps/api/src/modules/admin/resumen.ts.
  const r = (await respuesta.json()) as {
    calculado_en: string;
    cuentas_activas: number;
    profesores: { registrados: number; activos: number };
    convivencia: { registrados: number; activos: number };
    anio_activo: { anio: number; cursos: number; matriculas: number } | null;
    accesos_apoderado: number;
    protocolos_vigentes: number;
    reglas_activas: number;
  };
  return {
    calculadoEn: r.calculado_en,
    cuentasActivas: r.cuentas_activas,
    profesores: r.profesores,
    convivencia: r.convivencia,
    anioActivo: r.anio_activo,
    accesosApoderado: r.accesos_apoderado,
    protocolosVigentes: r.protocolos_vigentes,
    reglasActivas: r.reglas_activas,
  };
}
