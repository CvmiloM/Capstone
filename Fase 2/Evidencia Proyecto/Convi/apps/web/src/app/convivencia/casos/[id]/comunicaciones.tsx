import { Icono } from "@/app/components/icono";
import { claseEnlace } from "@/app/components/formulario";
import type { DetalleCaso } from "../datos";
import { AccionesComunicacion } from "./paneles-comunicacion";
import { Correos } from "./correos";
import { FormularioComunicacion } from "./formulario-comunicacion";
import { NOMBRE_ROL_ASISTENTE, NOMBRE_TIPO_COMUNICACION } from "./opciones";

export function Comunicaciones({
  caso,
  formatearFecha,
  redactar,
}: {
  caso: DetalleCaso;
  redactar: boolean;
  formatearFecha: (iso: string) => string;
}) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="registros-comunicacion" className="rounded-xl border border-border bg-muted/25 p-4 sm:p-5">
        <h3 id="registros-comunicacion" className="text-base font-semibold">Registros de comunicación</h3>
        <p className="mt-1 text-sm text-muted-foreground">Llamadas, conversaciones y otros contactos del caso.</p>
        {caso.estado_actual !== "CERRADO" && (
          <div className="mt-4">
            <AccionesComunicacion acciones={[{
              clave: "registrar",
              titulo: "Registrar una comunicación",
              principal: true,
              formulario: <FormularioComunicacion casoId={caso.id} destinatarios={caso.destinatarios_comunicacion} ahora={caso.ahora} />,
            }]} />
          </div>
        )}
        {caso.comunicaciones.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Todavía no hay comunicaciones registradas.</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {caso.comunicaciones.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <h4 className="font-semibold">{NOMBRE_TIPO_COMUNICACION[c.tipo] ?? c.tipo} · {c.destinatario}</h4>
                  <p className="text-xs text-muted-foreground">{formatearFecha(c.ocurrido_en)}</p>
                </div>
                <p className="mt-2 whitespace-pre-line break-words">{c.resumen}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {c.rol ? (NOMBRE_ROL_ASISTENTE[c.rol] ?? c.rol) : "Fuera del caso"}
                  {" · "}Registró {c.creado_por} el {formatearFecha(c.creado_en)}
                </p>
                {c.advertencia && (
                  <p className="mt-2 rounded-lg bg-naranjo/15 px-3 py-2 text-xs">
                    El vínculo indica que este apoderado no puede ser contactado. La advertencia quedó en la auditoría.
                  </p>
                )}
                {c.respaldo && (
                  <a href={`/convivencia/comunicaciones/${c.id}/respaldo`} className={`mt-2 inline-flex items-center gap-1.5 ${claseEnlace}`} aria-label={`Descargar respaldo: ${c.respaldo}`}>
                    <Icono nombre="descargar" className="size-4 shrink-0" />
                    Descargar respaldo
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Correos key={redactar ? "redactar" : "correos"} caso={caso} formatearFecha={formatearFecha} redactar={redactar} />
    </div>
  );
}
