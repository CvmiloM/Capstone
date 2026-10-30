import Link from "next/link";
import { claseEnlace } from "@/app/components/formulario";
import type { DetalleCaso } from "../datos";
import { ESTADOS_CUMPLIMIENTO } from "./opciones";
import { FormularioSeguimiento } from "./formularios-seguimientos";

const NOMBRES: Record<string, string> = {
  ...Object.fromEntries(ESTADOS_CUMPLIMIENTO),
  PLANIFICADA: "Planificado",
  POSPUESTA: "Pospuesto",
  REALIZADA: "Realizado",
  CANCELADA: "Cancelado",
};
const resumen =
  "cursor-pointer list-none rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden";
function Estado({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs ${["REALIZADA", "COMPLETADO"].includes(estado) ? "bg-verde/15" : ["VENCIDO"].includes(estado) ? "bg-naranjo/15" : "bg-muted"}`}
    >
      {NOMBRES[estado] ?? estado}
    </span>
  );
}

export function SeguimientoCaso({
  caso,
  formatearFecha,
}: {
  caso: DetalleCaso;
  formatearFecha: (iso: string) => string;
}) {
  const abierto = caso.estado_actual !== "CERRADO";
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Registra los acuerdos y revisa su cumplimiento en los seguimientos, abre
        una tarjeta para ver detalles y opciones
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Compromisos del caso</h3>
        <Link href="/convivencia/seguimientos" className={claseEnlace}>
          Ver agenda de seguimientos
        </Link>
      </div>
      {caso.compromisos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Todavía no hay compromisos registrados
        </p>
      )}
      {caso.compromisos.map((c) => (
        <details
          key={c.id}
          className="rounded-2xl border border-border bg-card"
        >
          <summary className={resumen}>
            <span className="flex items-start justify-between gap-3">
              <span className="font-medium">{c.descripcion}</span>
              <Estado estado={c.estado} />
            </span>
            <span className="mt-2 block text-sm text-muted-foreground">
              {c.responsable}, hasta {formatearFecha(c.vence_en)}
              {c.vencido ? ", plazo vencido" : ""}
            </span>
          </summary>
          <div className="space-y-3 border-t border-border p-4 text-sm">
            <p>
              Registrado por {c.creado_por} el {formatearFecha(c.creado_en)}
            </p>
            {c.origen && <p>Se acordó en: {c.origen}</p>}
            <h4 className="font-medium">Revisiones de cumplimiento</h4>
            {c.revisiones.length === 0 && (
              <p className="text-muted-foreground">
                Todavía no se ha revisado en un seguimiento
              </p>
            )}
            {c.revisiones.map((r) => (
              <div key={r.id} className="rounded-xl bg-muted/50 p-3">
                <Estado estado={r.estado} />
                <p className="mt-2 whitespace-pre-line">{r.observacion}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.autor}, {formatearFecha(r.registrado_en)}
                </p>
              </div>
            ))}
          </div>
        </details>
      ))}
      {abierto && (
        <details className="rounded-2xl border border-border">
          <summary className={resumen + " font-medium text-primary"}>
            Registrar un compromiso
          </summary>
          <div className="border-t border-border p-4">
            <FormularioSeguimiento caso={caso} modo="compromiso" />
          </div>
        </details>
      )}
      <h3 className="font-semibold">Seguimientos</h3>
      {caso.seguimientos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Todavía no hay seguimientos programados
        </p>
      )}
      {caso.seguimientos.map((s) => (
        <details
          key={s.id}
          id={`seguimiento-${s.id}`}
          className="rounded-2xl border border-border bg-card"
        >
          <summary className={resumen}>
            <span className="flex items-start justify-between gap-3">
              <span className="font-medium">{s.objetivo}</span>
              <Estado estado={s.estado} />
            </span>
            <span className="mt-2 block text-sm text-muted-foreground">
              {formatearFecha(s.programado_en)}, {s.responsable}
            </span>
          </summary>
          <div className="space-y-4 border-t border-border p-4 text-sm">
            {s.realizado_en && (
              <div>
                <p className="font-medium">
                  Realizado el {formatearFecha(s.realizado_en)}
                </p>
                <p className="mt-2 whitespace-pre-line">{s.resultado}</p>
                <p className="mt-2 whitespace-pre-line">
                  Próxima acción: {s.proxima_accion}
                </p>
              </div>
            )}
            {s.seguimiento_anterior_id && (
              <a
                className={claseEnlace}
                href={`#seguimiento-${s.seguimiento_anterior_id}`}
              >
                Ver seguimiento anterior
              </a>
            )}
            {s.siguiente_id && (
              <a
                className={claseEnlace}
                href={`#seguimiento-${s.siguiente_id}`}
              >
                Ver siguiente seguimiento
              </a>
            )}
            {s.reprogramaciones.map((r, i) => (
              <div key={i} className="rounded-xl bg-muted/50 p-3">
                <p>
                  Reprogramado desde {formatearFecha(r.fecha_anterior)} a{" "}
                  {formatearFecha(r.fecha_nueva)}
                </p>
                <p className="mt-1 whitespace-pre-line">{r.motivo}</p>
              </div>
            ))}
            {abierto && ["PLANIFICADA", "POSPUESTA"].includes(s.estado) && (
              <>
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">
                    Registrar resultado y revisar compromisos
                  </summary>
                  <FormularioSeguimiento
                    caso={caso}
                    modo="resultado"
                    seguimiento={s}
                  />
                </details>
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">
                    Reprogramar seguimiento
                  </summary>
                  <FormularioSeguimiento
                    caso={caso}
                    modo="reprogramacion"
                    seguimiento={s}
                  />
                </details>
              </>
            )}
            {abierto &&
              s.estado === "REALIZADA" &&
              caso.compromisos
                .filter(
                  (c) => !c.revisiones.some((r) => r.actuacion_id === s.id),
                )
                .map((c) => (
                  <details key={c.id}>
                    <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">
                      Revisar compromiso: {c.descripcion}
                    </summary>
                    <FormularioSeguimiento
                      caso={caso}
                      modo="revisiones"
                      seguimiento={s}
                      compromiso={c}
                    />
                  </details>
                ))}
          </div>
        </details>
      ))}
      {abierto ? (
        <details className="rounded-2xl border border-border">
          <summary className={resumen + " font-medium text-primary"}>
            Programar un seguimiento
          </summary>
          <div className="border-t border-border p-4">
            <FormularioSeguimiento caso={caso} modo="programar" />
          </div>
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">
          El caso está cerrado, sus compromisos y seguimientos se conservan
        </p>
      )}
    </div>
  );
}
