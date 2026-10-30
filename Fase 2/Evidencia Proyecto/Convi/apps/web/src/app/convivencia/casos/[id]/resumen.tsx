import Link from "next/link";
import { claseEnlace } from "@/app/components/formulario";
import { formatearDia, type DetalleCaso } from "../datos";

export function ResumenCaso({
  caso,
  fecha,
}: {
  caso: DetalleCaso;
  fecha: (iso: string) => string;
}) {
  const ruta = `/convivencia/casos/${caso.id}`;
  const pendientes = caso.compromisos.filter(
    (c) => !["COMPLETADO", "CANCELADO"].includes(c.estado),
  );
  const proximo = caso.seguimientos
    .filter((s) => ["PLANIFICADA", "POSPUESTA"].includes(s.estado))
    .sort((a, b) => a.programado_en.localeCompare(b.programado_en))[0];
  const realizados = caso.seguimientos.filter((s) => s.estado === "REALIZADA");
  const estudiantes = [
    ...new Map(
      caso.participantes
        .filter((p) => p.estudiante_id)
        .map((p) => [p.estudiante_id, p]),
    ).values(),
  ];
  const panel = "rounded-2xl border border-border bg-card p-5 sm:p-6";
  return (
    <div className="grid items-start gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <section className={panel}>
          <h2 className="text-lg font-semibold">Resumen del caso</h2>
          <p className="mt-3 max-w-prose whitespace-pre-line text-sm leading-relaxed">
            {caso.resumen || "Todavía no se ha registrado un resumen"}
          </p>
          {caso.justificacion_independiente && (
            <details className="mt-4 border-t border-border pt-3 text-sm">
              <summary className="cursor-pointer py-2 font-medium text-primary">
                Por qué se abrió como un caso independiente
              </summary>
              <p className="mt-2 whitespace-pre-line">
                {caso.justificacion_independiente}
              </p>
            </details>
          )}
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">Seguimiento pendiente</h2>
          {proximo ? (
            <Link
              href={`${ruta}?seccion=seguimientos#seguimiento-${proximo.id}`}
              className="mt-3 block rounded-xl bg-accent p-4 text-accent-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <p className="font-semibold">{proximo.objetivo}</p>
              <p className="mt-1 text-sm">
                {fecha(proximo.programado_en)} · {proximo.responsable}
              </p>
            </Link>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No hay seguimientos pendientes registrados
            </p>
          )}
          <Link
            className={`mt-4 inline-flex min-h-11 items-center text-sm ${claseEnlace}`}
            href={`${ruta}?seccion=seguimientos`}
          >
            Ver todos los seguimientos
          </Link>
        </section>
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Compromisos pendientes</h2>
            <Link
              className={`min-h-11 content-center text-sm ${claseEnlace}`}
              href={`${ruta}?seccion=compromisos`}
            >
              Ver todos ({pendientes.length})
            </Link>
          </div>
          {pendientes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No hay compromisos pendientes registrados
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {pendientes.slice(0, 3).map((c) => (
                <li key={c.id} className="py-3 text-sm">
                  <p className="font-medium">{c.descripcion}</p>
                  <p className="mt-1 text-muted-foreground">
                    {c.responsable} · Plazo: {fecha(c.vence_en)}
                    {c.vencido ? " · Vencido" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {pendientes.length > 3 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Se muestran 3 de {pendientes.length} compromisos pendientes
            </p>
          )}
        </section>
      </div>
      <aside className="space-y-6" aria-label="Datos y participantes del caso">
        <section className={panel}>
          <h2 className="text-base font-semibold">Datos del expediente</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {[
              ["Responsable", caso.responsable],
              ["Inicio", formatearDia(caso.fecha_inicio)],
              ["Categoría", caso.categoria ?? "Sin categoría"],
              [
                "Cierre sugerido",
                caso.fecha_limite_cierre
                  ? formatearDia(caso.fecha_limite_cierre)
                  : "Sin plazo configurado",
              ],
              ["Situaciones vinculadas", caso.situaciones_vinculadas.length],
              ["Seguimientos realizados", realizados.length],
              ["Evidencias", caso.evidencias.length],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{etiqueta}</dt>
                <dd className="text-right font-medium">{valor}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Abierto por {caso.abierto_por}, {fecha(caso.abierto_en)}
          </p>
          {caso.cerrado_en && (
            <p className="mt-2 text-xs text-muted-foreground">
              Cerrado el {fecha(caso.cerrado_en)}
            </p>
          )}
        </section>
        <section className={panel}>
          <h2 className="text-base font-semibold">Estudiantes del caso</h2>
          {estudiantes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Sin estudiantes vinculados
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {estudiantes.slice(0, 4).map((p) => (
                <li key={p.estudiante_id} className="py-3 text-sm">
                  <Link
                    className={`font-medium ${claseEnlace}`}
                    href={`/convivencia/estudiantes/${p.estudiante_id}`}
                  >
                    {p.nombres} {p.apellidos}
                  </Link>
                  <p className="mt-1 text-muted-foreground">
                    Curso actual: {p.curso_actual ?? "Sin matrícula activa"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            className={`mt-2 inline-flex min-h-11 items-center text-sm ${claseEnlace}`}
            href={`${ruta}?seccion=participantes`}
          >
            Ver participantes y antecedentes
          </Link>
        </section>
        <section className={panel}>
          <h2 className="text-base font-semibold">Protocolo aplicado</h2>
          {caso.protocolos_aplicados.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No hay protocolos aplicados
            </p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {caso.protocolos_aplicados.map((p) => (
                <li key={p.id}>
                  <p className="font-medium">{p.protocolo}</p>
                  <p className="mt-1 text-muted-foreground">
                    Versión {p.numero_version} ·{" "}
                    {
                      p.pasos.filter((paso) => paso.estado === "COMPLETADO")
                        .length
                    }{" "}
                    de {p.pasos.length} pasos completados
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            className={`mt-2 inline-flex min-h-11 items-center text-sm ${claseEnlace}`}
            href={`${ruta}?seccion=protocolo`}
          >
            Revisar protocolo y fundamento
          </Link>
        </section>
      </aside>
    </div>
  );
}
