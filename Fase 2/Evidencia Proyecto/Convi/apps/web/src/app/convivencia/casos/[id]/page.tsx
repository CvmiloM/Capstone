import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { claseEnlace } from "@/app/components/formulario";
// Mismo formato de fecha y nombres de rol que el resto del portal.
import { formatearFecha } from "@/app/profesor/datos";
import { NOMBRE_ROL_EN_SITUACION } from "@/app/profesor/situacion-opciones";
import { AvisoNoDisponible } from "../../aviso-no-disponible";
import { formatearDia, NOMBRE_ESTADO_CASO, obtenerCaso } from "../datos";

export const metadata: Metadata = { title: "Caso" };

const AVISOS: Record<string, string> = {
  creado:
    "Abriste el caso. Quedó En análisis con su código, y la situación de origen y sus estudiantes quedaron vinculados.",
};

// PB-053 (HU-046): detalle de un caso con sus estudiantes y las situaciones
// vinculadas. Los cambios de estado y el cierre vienen en PB-152 y PB-054.
export default async function PaginaCaso({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const respuesta = await obtenerCaso(id);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia/casos" />;
  const caso = respuesta.datos;
  const textoAviso = aviso ? AVISOS[aviso] : undefined;

  return (
    <>
      <Link href="/convivencia/casos" className={`text-sm ${claseEnlace}`}>
        ← Casos
      </Link>

      {textoAviso && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm"
        >
          {textoAviso}
        </div>
      )}

      <div className="mt-4 mb-6">
        <p className="font-mono text-sm text-muted-foreground">{caso.codigo}</p>
        <h1 className="mt-1 text-2xl font-semibold">{caso.titulo}</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            Estado: {NOMBRE_ESTADO_CASO[caso.estado_actual] ?? caso.estado_actual}
          </span>
          {caso.registro_historico && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              Registro histórico
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion titulo="Resumen" className="lg:col-span-2">
          <p className="whitespace-pre-line text-sm">{caso.resumen}</p>
          {caso.justificacion_independiente && (
            <div className="mt-4 border-t border-border pt-4 text-sm">
              <p className="text-xs text-muted-foreground">
                Por qué se abrió aparte de otros casos activos de los mismos estudiantes
              </p>
              <p className="mt-1 whitespace-pre-line">{caso.justificacion_independiente}</p>
            </div>
          )}
        </Seccion>

        <Seccion titulo="Datos del caso">
          <dl className="space-y-3 text-sm">
            <Dato nombre="Inicio">{formatearDia(caso.fecha_inicio)}</Dato>
            <Dato nombre="Responsable">{caso.responsable}</Dato>
            <Dato nombre="Categoría principal">{caso.categoria ?? "Sin categoría"}</Dato>
            <Dato nombre="Cierre sugerido">
              {caso.fecha_limite_cierre
                ? `${formatearDia(caso.fecha_limite_cierre)} (${caso.plazo_cierre_dias_aplicado} días)`
                : "La escuela no tiene plazo sugerido"}
            </Dato>
            <Dato nombre="Abierto">
              {formatearFecha(caso.abierto_en)} por {caso.abierto_por}
            </Dato>
          </dl>
        </Seccion>

        <Seccion titulo="Estudiantes del caso" className="lg:col-span-3">
          {caso.participantes.length === 0 ? (
            <p className="text-sm text-muted-foreground">El caso no tiene estudiantes.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {caso.participantes.map((p) => (
                <li
                  key={`${p.codigo_estudiante ?? ""}-${p.apellidos}-${p.nombres}-${p.rol}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div>
                    <p className="font-medium">
                      {p.estudiante_id ? (
                        <Link
                          href={`/convivencia/estudiantes/${p.estudiante_id}`}
                          className={claseEnlace}
                        >
                          {p.apellidos}, {p.nombres}
                        </Link>
                      ) : (
                        `${p.apellidos}, ${p.nombres}`
                      )}
                      {p.codigo_estudiante && (
                        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                          {p.codigo_estudiante}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.curso_matricula
                        ? `Curso al ocurrir el hecho: ${p.curso_matricula}`
                        : "Curso histórico no registrado"}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {NOMBRE_ROL_EN_SITUACION[p.rol] ?? p.rol}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Situaciones vinculadas" className="lg:col-span-3">
          {caso.situaciones_vinculadas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              El caso no tiene situaciones vinculadas.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {caso.situaciones_vinculadas.map((s) => (
                <li key={s.id} className="py-2.5">
                  <Link href={`/convivencia/situaciones/${s.id}`} className={claseEnlace}>
                    <span className="font-mono">{s.codigo}</span>
                  </Link>{" "}
                  · {s.categoria ?? "Sin categoría"}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Ocurrió el {formatearFecha(s.ocurrido_en)} · vinculada el{" "}
                    {formatearFecha(s.vinculado_a_caso_en)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </div>
    </>
  );
}

function Seccion({
  titulo,
  className = "",
  children,
}: {
  titulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card p-5 shadow-tarjeta ${className}`}
    >
      <h2 className="mb-3 text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{nombre}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
