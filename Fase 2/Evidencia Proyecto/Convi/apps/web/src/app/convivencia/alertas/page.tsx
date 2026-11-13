import type { Metadata } from "next";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { claseEnlace } from "@/app/components/formulario";
import { NOMBRE_PRIORIDAD } from "@/app/components/reglas/opciones";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { obtenerAlertas } from "./datos";
import {
  CLASE_ESTADO_ALERTA,
  CLASE_PRIORIDAD,
  FILTROS_ALERTA,
  formatoFecha,
  NOMBRE_ESTADO_ALERTA,
} from "./opciones";

export const metadata: Metadata = { title: "Alertas" };

// PB-093 (HU-080): bandeja de las alertas que genera el motor de reglas. Al
// entrar muestra las Nuevas, primero las de prioridad alta y luego las más
// recientes (por defecto). Todo el equipo de Convivencia ve todas las alertas.
export default async function BandejaAlertas({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; pagina?: string }>;
}) {
  const parametros = await searchParams;
  const estado = FILTROS_ALERTA.some((f) => f.valor === parametros.estado)
    ? parametros.estado!
    : "NUEVA";
  const respuesta = await obtenerAlertas({
    estado,
    pagina: parametros.pagina,
  });
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia/alertas" />;
  const b = respuesta.datos;
  const fecha = formatoFecha(b.zona_horaria);
  const enlace = (filtro: string, pagina = 1) =>
    `/convivencia/alertas?${new URLSearchParams({ estado: filtro, pagina: String(pagina) })}`;
  const totalTodas = Object.values(b.conteo).reduce((suma, n) => suma + n, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-titulo text-3xl font-semibold">Alertas</h1>
        <p className="mt-2 text-muted-foreground">
          CONVI genera una alerta cuando los registros cumplen una regla de aviso de la escuela. Ábrela para revisar sus antecedentes y dejar escrito qué se hizo.
        </p>
      </header>
      <details className="rounded-xl border border-border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">¿Qué diferencia hay entre regla, alerta y aviso?</summary>
        <dl className="mt-4 space-y-3">
          <div><dt className="font-medium">Regla de aviso</dt><dd>Es la condición que configura la escuela para detectar un patrón de registros.</dd></div>
          <div><dt className="font-medium">Alerta</dt><dd>Es el registro que se crea al cumplirse la regla. El equipo revisa sus antecedentes y decide cómo actuar; no es una sanción.</dd></div>
          <div><dt className="font-medium">Aviso de la campanita</dt><dd>Informa a cada usuario sobre una alerta u otro acontecimiento. Leer el aviso no marca la alerta como revisada.</dd></div>
        </dl>
      </details>

      <nav aria-label="Filtrar alertas por estado">
        <ul className="flex flex-wrap gap-1.5">
          {FILTROS_ALERTA.map((filtro) => {
            const activo = filtro.valor === estado;
            return (
              <li key={filtro.valor}>
                <Link
                  href={enlace(filtro.valor)}
                  aria-current={activo ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                    activo
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {filtro.texto}
                  <span
                    className={`rounded-full px-1.5 text-xs ${
                      activo
                        ? "bg-primary-foreground/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {filtro.valor === "TODAS"
                      ? totalTodas
                      : (b.conteo[filtro.valor] ?? 0)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {b.alertas.length === 0 ? (
        <p className="rounded-2xl border border-border p-6 text-muted-foreground">
          {estado === "NUEVA"
            ? "No hay alertas nuevas."
            : "No hay alertas en este estado."}
        </p>
      ) : (
        <ul className="space-y-3">
          {b.alertas.map((a) => (
            <li key={a.id}>
              <Link
                href={`/convivencia/alertas/${a.id}`}
                className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{a.regla}</span>
                  <span className="flex flex-wrap gap-1.5 text-xs">
                    <span
                      className={`rounded-full px-3 py-1 ${CLASE_PRIORIDAD[a.prioridad] ?? "bg-muted"}`}
                    >
                      Prioridad {NOMBRE_PRIORIDAD[a.prioridad]?.toLowerCase() ?? a.prioridad}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 ${CLASE_ESTADO_ALERTA[a.estado] ?? "bg-muted"}`}
                    >
                      {NOMBRE_ESTADO_ALERTA[a.estado] ?? a.estado}
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  {a.referencia ?? "Toda la escuela"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generada el {fecha(a.generada_en)} · regla {a.codigo_regla}{" "}
                  (versión {a.numero_version})
                </p>
                {a.resumen && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.resumen}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Páginas de alertas" className="flex items-center gap-5">
        {b.pagina > 1 && (
          <Link href={enlace(estado, b.pagina - 1)} className={claseEnlace}>
            Anterior
          </Link>
        )}
        <span className="text-sm">
          Página {b.pagina} · {b.total}{" "}
          {b.total === 1 ? "alerta" : "alertas"}
        </span>
        {b.pagina * b.limite < b.total && (
          <Link href={enlace(estado, b.pagina + 1)} className={claseEnlace}>
            Siguiente
          </Link>
        )}
      </nav>
    </div>
  );
}
