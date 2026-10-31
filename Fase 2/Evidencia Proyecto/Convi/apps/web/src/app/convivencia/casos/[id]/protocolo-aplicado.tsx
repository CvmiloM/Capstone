import Link from "next/link";
import { FormularioEvidencia } from "@/app/components/evidencias/formulario-evidencia";
import { NOMBRE_TIPO_EVIDENCIA } from "@/app/components/evidencias/opciones";
import { claseEnlace } from "@/app/components/formulario";
import type { DetalleCaso, PasoProtocolo } from "../datos";
import {
  FormularioAsignacionPaso,
  FormularioAvancePaso,
  FormularioEstadoProtocolo,
} from "./formularios-protocolo";
import { NOMBRE_ESTADO_PASO, NOMBRE_ESTADO_PROTOCOLO } from "./opciones";
import { Desplegable } from "./plan-intervencion";

// PB-082 (HU-071): protocolos aplicados al caso con sus pasos. PB-055
// (HU-048): cada paso abierto registra su avance, su responsable y su plazo, y
// recibe respaldos. PB-056 (HU-049): el protocolo se completa, cancela o
// reabre con un motivo. Decisión del PO (por defecto): un paso completado u
// omitido y un protocolo terminado se conservan como quedaron.
const PASO_ABIERTO = ["PENDIENTE", "EN_PROGRESO", "VENCIDO"];

function estadoPaso(paso: PasoProtocolo) {
  return paso.vencido ? "VENCIDO" : paso.estado;
}

export function ProtocolosAplicados({
  caso,
  formatearFecha,
  adjuntar,
}: {
  caso: DetalleCaso;
  formatearFecha: (iso: string) => string;
  /** Paso cuyo formulario de respaldo se muestra (?adjuntar=). */
  adjuntar?: string;
}) {
  const abierto = caso.estado_actual !== "CERRADO";
  const ruta = `/convivencia/casos/${caso.id}`;

  return caso.protocolos_aplicados.map((aplicado) => {
    const activo = aplicado.estado === "ACTIVO";
    return (
      <div
        key={aplicado.id}
        id={`protocolo-${aplicado.id}`}
        className="mb-4 rounded-xl border border-border p-4 text-sm"
      >
        <p className="font-medium">
          {aplicado.protocolo} · versión {aplicado.numero_version}
          <span className="ml-2 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            {NOMBRE_ESTADO_PROTOCOLO[aplicado.estado] ?? aplicado.estado}
          </span>
        </p>
        <p className="mt-1 whitespace-pre-line">{aplicado.fundamento}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Aplicado por {aplicado.aplicado_por} el{" "}
          {formatearFecha(aplicado.aplicado_en)}
        </p>
        {aplicado.terminado_en && (
          <div
            className={`mt-3 border-l-2 pl-3 ${aplicado.estado === "COMPLETADO" ? "border-verde" : "border-naranjo"}`}
          >
            <p className="text-xs text-muted-foreground">
              {aplicado.estado === "COMPLETADO" ? "Completado" : "Cancelado"} el{" "}
              {formatearFecha(aplicado.terminado_en)}
            </p>
            {aplicado.motivo_termino && (
              <p className="mt-0.5 whitespace-pre-line">
                {aplicado.motivo_termino}
              </p>
            )}
          </div>
        )}

        <ol className="mt-3 divide-y divide-border border-t border-border">
          {aplicado.pasos.map((paso) => {
            const editable =
              abierto && activo && PASO_ABIERTO.includes(paso.estado);
            return (
              <li key={paso.id} id={`paso-${paso.id}`} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p>
                      {paso.orden_paso}. {paso.nombre}
                    </p>
                    {paso.descripcion && (
                      <p className="mt-0.5 whitespace-pre-line text-muted-foreground">
                        {paso.descripcion}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        paso.vence_en
                          ? `Vence el ${formatearFecha(paso.vence_en)}`
                          : "Sin plazo",
                        paso.responsable
                          ? `Responsable: ${paso.responsable}`
                          : "Sin responsable asignado",
                        paso.es_obligatorio ? null : "Opcional",
                        paso.requiere_evidencia ? "Exige evidencia" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      paso.vencido
                        ? "bg-naranjo/15 font-medium text-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {NOMBRE_ESTADO_PASO[estadoPaso(paso)] ?? paso.estado}
                  </span>
                </div>

                {paso.estado === "COMPLETADO" && (
                  <div className="mt-2 border-l-2 border-verde pl-3">
                    <p className="text-xs text-muted-foreground">
                      Completado
                      {paso.completado_en &&
                        ` el ${formatearFecha(paso.completado_en)}`}
                      {paso.completado_por && ` por ${paso.completado_por}`}
                    </p>
                    {paso.notas && (
                      <p className="mt-0.5 whitespace-pre-line">{paso.notas}</p>
                    )}
                  </div>
                )}
                {paso.estado === "OMITIDO" && (
                  <div className="mt-2 border-l-2 border-naranjo pl-3">
                    <p className="text-xs text-muted-foreground">
                      Justificación de la omisión
                    </p>
                    <p className="mt-0.5 whitespace-pre-line">{paso.notas}</p>
                  </div>
                )}
                {PASO_ABIERTO.includes(paso.estado) && paso.notas && (
                  <p className="mt-2 whitespace-pre-line text-muted-foreground">
                    {paso.notas}
                  </p>
                )}

                {paso.respaldos.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {paso.respaldos.map((respaldo) => (
                      <li
                        key={respaldo.id}
                        className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"
                      >
                        <span className="text-sm text-foreground">
                          {respaldo.titulo}
                        </span>
                        <span>
                          {[
                            NOMBRE_TIPO_EVIDENCIA[respaldo.tipo] ?? respaldo.tipo,
                            respaldo.archivo,
                            respaldo.creado_por
                              ? `${respaldo.creado_por}, ${formatearFecha(respaldo.creado_en)}`
                              : formatearFecha(respaldo.creado_en),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {respaldo.archivo && (
                          <a
                            href={`/convivencia/evidencias/${respaldo.id}`}
                            className={claseEnlace}
                          >
                            Descargar
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {editable && (
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                    <Desplegable titulo="Registrar avance">
                      <FormularioAvancePaso casoId={caso.id} paso={paso} />
                    </Desplegable>
                    <Desplegable titulo="Responsable y plazo">
                      <FormularioAsignacionPaso
                        casoId={caso.id}
                        paso={paso}
                        responsables={caso.responsables_paso}
                        hoy={caso.hoy}
                      />
                    </Desplegable>
                    {adjuntar !== paso.id && (
                      <Link
                        href={`${ruta}?seccion=protocolo&adjuntar=${paso.id}#paso-${paso.id}`}
                        scroll={false}
                        className={`text-sm font-medium ${claseEnlace}`}
                      >
                        Adjuntar respaldo
                      </Link>
                    )}
                  </div>
                )}
                {editable && adjuntar === paso.id && (
                  <div className="mt-3 rounded-xl border border-border bg-card p-4">
                    <h3 className="mb-3 text-sm font-semibold">
                      Adjuntar respaldo al paso
                    </h3>
                    <FormularioEvidencia
                      destino="convivencia-paso"
                      registroId={caso.id}
                      pasoId={paso.id}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {abierto && (
          <div className="mt-4 border-t border-border pt-4 lg:max-w-xl">
            <h3 className="mb-3 text-sm font-semibold">
              {activo ? "Terminar el protocolo" : "Reabrir el protocolo"}
            </h3>
            <FormularioEstadoProtocolo
              casoId={caso.id}
              protocoloId={aplicado.id}
              version={aplicado.version}
              estadoActual={aplicado.estado}
            />
          </div>
        )}
        {!abierto && (
          <p className="mt-2 text-sm text-muted-foreground">
            El caso está cerrado: el protocolo y sus pasos se conservan como
            quedaron.
          </p>
        )}
      </div>
    );
  });
}
