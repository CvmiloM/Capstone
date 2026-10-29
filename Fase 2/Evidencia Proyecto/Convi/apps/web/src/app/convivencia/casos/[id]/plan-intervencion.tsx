import type { ReactNode } from "react";
import { formatearDia, type AccionPlan, type DetalleCaso } from "../datos";
import {
  FormularioAvanceAccion,
  FormularioCorreccionAccion,
  FormularioEstadoPlan,
  FormularioNuevaAccion,
  FormularioNuevoPlan,
} from "./formularios-plan";
import { NOMBRE_ESTADO_ACCION, NOMBRE_ESTADO_PLAN } from "./opciones";

// PB-061 y PB-062 (HU-054): plan de intervención del caso con sus acciones.
// Decisión del PO (por defecto): un solo plan vigente (Borrador o Activo) por
// caso; un plan terminado y sus acciones se conservan como quedaron.
const VIGENTE = ["BORRADOR", "ACTIVO"];
const ABIERTA = ["PENDIENTE", "EN_PROGRESO", "VENCIDO"];

function estadoAccion(accion: AccionPlan) {
  return accion.vencida ? "VENCIDO" : accion.estado;
}

export function PlanIntervencion({
  caso,
  formatearFecha,
}: {
  caso: DetalleCaso;
  formatearFecha: (iso: string) => string;
}) {
  const abierto = caso.estado_actual !== "CERRADO";
  const hayVigente = caso.planes_intervencion.some((p) => VIGENTE.includes(p.estado));

  return (
    <>
      {caso.planes_intervencion.length === 0 && (
        <p className="text-sm text-muted-foreground">
          El caso todavía no tiene un plan de intervención.
        </p>
      )}

      {caso.planes_intervencion.map((plan) => {
        const editable = abierto && VIGENTE.includes(plan.estado);
        return (
          <div key={plan.id} className="mb-4 rounded-xl border border-border p-4 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                {NOMBRE_ESTADO_PLAN[plan.estado] ?? plan.estado}
              </span>
              {plan.protocolo && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  Origen: {plan.protocolo}
                </span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-line font-medium">{plan.objetivo}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Creado por {plan.creado_por} el {formatearFecha(plan.creado_en)}
            </p>
            {plan.terminado_en && (
              <div
                className={`mt-3 border-l-2 pl-3 ${plan.estado === "COMPLETADO" ? "border-verde" : "border-naranjo"}`}
              >
                <p className="text-xs text-muted-foreground">
                  {plan.estado === "COMPLETADO" ? "Completado" : "Cancelado"} el{" "}
                  {formatearFecha(plan.terminado_en)}
                </p>
                {plan.motivo_termino && (
                  <p className="mt-0.5 whitespace-pre-line">{plan.motivo_termino}</p>
                )}
              </div>
            )}

            <h3 className="mt-4 text-sm font-semibold">Acciones</h3>
            {plan.acciones.length === 0 ? (
              <p className="mt-1 text-muted-foreground">El plan todavía no tiene acciones.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border border-t border-border">
                {plan.acciones.map((accion) => (
                  <li key={accion.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="whitespace-pre-line">{accion.descripcion}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Responsable: {accion.responsable} · vence el{" "}
                          {formatearDia(accion.vence_dia)}
                        </p>
                      </div>
                      <Etiqueta vencida={estadoAccion(accion) === "VENCIDO"}>
                        {NOMBRE_ESTADO_ACCION[estadoAccion(accion)] ?? accion.estado}
                      </Etiqueta>
                    </div>
                    {accion.estado === "COMPLETADO" && (
                      <div className="mt-2 border-l-2 border-verde pl-3">
                        <p className="text-xs text-muted-foreground">
                          Cumplida el{" "}
                          {accion.completado_dia ? formatearDia(accion.completado_dia) : "—"}
                        </p>
                        {accion.notas && (
                          <p className="mt-0.5 whitespace-pre-line">{accion.notas}</p>
                        )}
                      </div>
                    )}
                    {accion.motivo_cancelacion && (
                      <div className="mt-2 border-l-2 border-naranjo pl-3">
                        <p className="text-xs text-muted-foreground">Motivo de la cancelación</p>
                        <p className="mt-0.5 whitespace-pre-line">{accion.motivo_cancelacion}</p>
                      </div>
                    )}
                    {accion.correcciones > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {accion.correcciones === 1
                          ? "Corregida 1 vez"
                          : `Corregida ${accion.correcciones} veces`}
                        {accion.ultima_correccion && `. Último motivo: ${accion.ultima_correccion}`}
                      </p>
                    )}

                    {editable && accion.estado !== "CANCELADO" && (
                      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                        {ABIERTA.includes(accion.estado) && (
                          <Desplegable titulo="Registrar avance">
                            <FormularioAvanceAccion
                              casoId={caso.id}
                              accionId={accion.id}
                              version={accion.version}
                              estadoActual={accion.estado}
                              hoy={caso.hoy}
                            />
                          </Desplegable>
                        )}
                        <Desplegable titulo="Corregir">
                          <FormularioCorreccionAccion
                            casoId={caso.id}
                            accion={accion}
                            responsables={caso.responsables_accion}
                            hoy={caso.hoy}
                          />
                        </Desplegable>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {editable && (
              <div className="mt-4 grid gap-6 border-t border-border pt-4 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Agregar una acción</h3>
                  <FormularioNuevaAccion
                    casoId={caso.id}
                    planId={plan.id}
                    responsables={caso.responsables_accion}
                    hoy={caso.hoy}
                  />
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Estado del plan</h3>
                  <FormularioEstadoPlan
                    casoId={caso.id}
                    planId={plan.id}
                    version={plan.version}
                    estadoActual={plan.estado}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {abierto && !hayVigente && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-3 text-sm font-semibold">
            {caso.planes_intervencion.length === 0 ? "Crear el plan" : "Crear un plan nuevo"}
          </h3>
          <FormularioNuevoPlan
            casoId={caso.id}
            protocolos={caso.protocolos_aplicados.map((p) => ({
              id: p.id,
              nombre: `${p.protocolo} · versión ${p.numero_version}`,
            }))}
          />
        </div>
      )}
      {!abierto && caso.planes_intervencion.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          El caso está cerrado: su plan y sus acciones se conservan como quedaron.
        </p>
      )}
    </>
  );
}

function Etiqueta({ vencida, children }: { vencida: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs ${
        vencida ? "bg-naranjo/15 font-medium text-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function Desplegable({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="group w-full sm:w-auto sm:min-w-80">
      <summary className="cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline">
        {titulo}
      </summary>
      <div className="mt-3 rounded-xl border border-border bg-card p-4">{children}</div>
    </details>
  );
}
