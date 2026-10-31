import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { claseEnlace } from "@/app/components/formulario";
import {
  formatearDia,
  NOMBRE_AMBITO,
  NOMBRE_OPERADOR,
  NOMBRE_PRIORIDAD,
  NOMBRE_TIPO,
  type Ambito,
  type Tipo,
} from "@/app/components/reglas/opciones";
import { AvisoNoDisponible } from "../../aviso-no-disponible";
import { NOMBRE_ESTADO } from "../../datos";
import { obtenerAlerta, type DetalleAlerta } from "../datos";
import {
  CLASE_ESTADO_ALERTA,
  CLASE_PRIORIDAD,
  formatoFecha,
  NOMBRE_ESTADO_ALERTA,
  NOMBRE_VENCIDO,
  SECCION_VENCIDO,
} from "../opciones";
import { FormularioRevision } from "./formulario-revision";

export const metadata: Metadata = { title: "Alerta" };

// PB-093 (HU-080): antes de revisar la alerta se ven la regla, el cálculo y
// los registros que la originaron (CA1). Revisarla no cambia la alerta ni su
// explicación (CA3) y la pantalla no diagnostica ni sanciona (CA4).
export default async function DetalleDeAlerta({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const respuesta = await obtenerAlerta(id);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia/alertas" />;
  const a = respuesta.datos;
  const fecha = formatoFecha(a.zona_horaria);

  return (
    <div className="space-y-6">
      <Link href="/convivencia/alertas" className={`text-sm ${claseEnlace}`}>
        Volver a las alertas
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2 text-xs">
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
        </div>
        <h1 className="mt-3 font-titulo text-3xl font-semibold">{a.regla}</h1>
        <p className="mt-2 text-muted-foreground">
          Generada el {fecha(a.generada_en)}
        </p>
      </header>

      {aviso === "revisada" && (
        <div
          role="status"
          className="rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm"
        >
          La revisión de la alerta quedó guardada.
        </div>
      )}

      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        Esta alerta solo cuenta registros según una regla de la escuela. No
        diagnostica al estudiante ni aplica sanciones: lo que se haga lo decide
        el equipo de Convivencia.
      </p>

      <Seccion titulo="Por qué se generó">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dato nombre="Regla">
            {a.codigo_regla}, versión {a.numero_version}
          </Dato>
          <Dato nombre="Tipo de regla">
            {NOMBRE_TIPO[a.tipo_regla as Tipo] ?? a.tipo_regla}
          </Dato>
          <Dato nombre="Ámbito">
            {NOMBRE_AMBITO[a.ambito as Ambito] ?? a.ambito}
          </Dato>
          <Dato nombre="Categoría">{a.categoria ?? "Todas las categorías"}</Dato>
          <Calculo explicacion={a.explicacion} />
        </dl>
        {a.formula && (
          <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 font-mono text-sm">
            {a.formula}
          </p>
        )}
      </Seccion>

      <Seccion titulo="A qué se refiere">
        <Referencia alerta={a} />
      </Seccion>

      {a.ambito === "CASO" ? (
        <Seccion titulo="Lo que estaba vencido">
          {a.vencidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              La alerta no guardó la lista de vencidos.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {a.vencidos.map((v) => {
                const seccion =
                  v.tipo === "actuaciones" && v.seguimiento
                    ? "seguimientos"
                    : SECCION_VENCIDO[v.tipo];
                return (
                  <li key={`${v.tipo}-${v.id}`} className="py-3 text-sm">
                    <p className="font-medium">
                      {v.tipo === "actuaciones" && v.seguimiento
                        ? "Seguimiento"
                        : (NOMBRE_VENCIDO[v.tipo] ?? v.tipo)}
                      {v.descripcion ? `: ${v.descripcion}` : ""}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {v.vence_en ? `Vencía el ${fecha(v.vence_en)}` : "Sin fecha"}
                      {a.caso && seccion && (
                        <>
                          {" · "}
                          <Link
                            href={`/convivencia/casos/${a.caso.id}?seccion=${seccion}`}
                            className={claseEnlace}
                          >
                            Ver en el caso
                          </Link>
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Seccion>
      ) : (
        <Seccion titulo="Situaciones que la originaron">
          {a.total_situaciones === 0 ? (
            <p className="text-sm text-muted-foreground">
              La alerta no tiene situaciones asociadas.
            </p>
          ) : (
            <>
              {a.total_situaciones > a.situaciones.length && (
                <p className="mb-2 text-sm text-muted-foreground">
                  Se muestran las {a.situaciones.length} más recientes de{" "}
                  {a.total_situaciones}.
                </p>
              )}
              <ul className="divide-y divide-border">
                {a.situaciones.map((s) => (
                  <li key={s.id} className="py-3 text-sm">
                    <Link
                      href={`/convivencia/situaciones/${s.id}`}
                      className={`font-medium ${claseEnlace}`}
                    >
                      {s.codigo}
                    </Link>
                    <p className="mt-1 text-muted-foreground">
                      Ocurrió el {fecha(s.ocurrido_en)} ·{" "}
                      {s.categoria ?? "Sin categoría"} ·{" "}
                      {NOMBRE_ESTADO[s.estado] ?? s.estado}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Seccion>
      )}

      <Seccion titulo="Revisión">
        {a.estado === "NUEVA" ? (
          <FormularioRevision alertaId={a.id} version={a.version} />
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              {NOMBRE_ESTADO_ALERTA[a.estado] ?? a.estado} por{" "}
              {a.revisado_por ?? "una persona del equipo"}
              {a.revisado_en ? ` el ${fecha(a.revisado_en)}` : ""}.
            </p>
            <p className="whitespace-pre-line rounded-lg bg-muted/40 px-3 py-2">
              {a.observacion}
            </p>
          </div>
        )}
      </Seccion>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-4 text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {nombre}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function texto(valor: unknown) {
  return typeof valor === "string" || typeof valor === "number"
    ? String(valor)
    : null;
}

function periodo(valor: unknown) {
  const p = valor as { desde?: unknown; hasta?: unknown } | null;
  const desde = texto(p?.desde);
  const hasta = texto(p?.hasta);
  return desde && hasta
    ? `Del ${formatearDia(desde)} al ${formatearDia(hasta)}`
    : null;
}

// HU-079 CA3: el cálculo que guardó el motor, tal como se evaluó.
function Calculo({ explicacion: e }: { explicacion: Record<string, unknown> }) {
  const operador = NOMBRE_OPERADOR[texto(e.operador) ?? ""]?.toLowerCase();
  const umbral = texto(e.umbral);
  const condicion = operador && umbral ? `${operador} ${umbral}` : null;
  if (e.metrica === "VARIACION_PORCENTUAL")
    return (
      <>
        <Dato nombre="Período actual">
          {periodo(e.periodo_actual) ?? "Sin dato"}: {texto(e.conteo_actual)}{" "}
          situaciones
        </Dato>
        <Dato nombre="Período anterior">
          {periodo(e.periodo_anterior) ?? "Sin dato"}:{" "}
          {texto(e.conteo_anterior)} situaciones
        </Dato>
        <Dato nombre="Variación">{texto(e.variacion)} %</Dato>
        {condicion && <Dato nombre="La regla pide">{condicion} %</Dato>}
      </>
    );
  if (e.metrica === "CONTEO_VENCIDOS")
    return (
      <>
        <Dato nombre="Vencidos">
          {texto(e.conteo)}
          {texto(e.al_cierre_de)
            ? ` al cierre del ${formatearDia(texto(e.al_cierre_de)!)}`
            : ""}
        </Dato>
        {condicion && <Dato nombre="La regla pide">{condicion}</Dato>}
      </>
    );
  return (
    <>
      <Dato nombre="Período contado">
        {periodo(e.periodo) ?? "Sin dato"}
        {texto(e.ventana_dias) ? ` (${texto(e.ventana_dias)} días)` : ""}
      </Dato>
      <Dato nombre="Situaciones contadas">{texto(e.conteo) ?? "Sin dato"}</Dato>
      {condicion && <Dato nombre="La regla pide">{condicion}</Dato>}
    </>
  );
}

function Referencia({ alerta: a }: { alerta: DetalleAlerta }) {
  if (a.estudiante)
    return (
      <p className="text-sm">
        Estudiante{" "}
        <Link
          href={`/convivencia/estudiantes/${a.estudiante.id}`}
          className={claseEnlace}
        >
          {a.estudiante.nombre}
        </Link>{" "}
        (código {a.estudiante.codigo})
      </p>
    );
  if (a.curso) return <p className="text-sm">Curso {a.curso.nombre}</p>;
  if (a.caso)
    return (
      <p className="text-sm">
        Caso{" "}
        <Link href={`/convivencia/casos/${a.caso.id}`} className={claseEnlace}>
          {a.caso.codigo}
        </Link>
        , {a.caso.titulo}
      </p>
    );
  return <p className="text-sm">Toda la escuela</p>;
}
