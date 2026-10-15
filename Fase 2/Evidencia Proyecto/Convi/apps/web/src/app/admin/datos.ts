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

// Datos del portal de administración. El contexto ya viene de la API; el
// resumen todavía devuelve datos de ejemplo (marcado con TODO).
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
  await comprobarAdministrador();
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) redirect("/login");
  // La API toma la escuela y la persona de la sesión, nunca del navegador.
  const respuesta = await fetch(`${URL_API}/admin/contexto`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (respuesta.status === 401) redirect("/login");
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
  await comprobarAdministrador();
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
