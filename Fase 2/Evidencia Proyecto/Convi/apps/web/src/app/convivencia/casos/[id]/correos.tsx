import type { DetalleCaso } from "../datos";
import { BotonDescartarCorreo, FormularioCorreo } from "./formulario-correo";
import { FormularioCorreoIA } from "./formulario-correo-ia";
import { NOMBRE_ESTADO_CORREO } from "./opciones";

// PB-151 (HU-130) y PB-086 (HU-075): correos al apoderado del caso, del más
// reciente al más antiguo. Se redactan a mano o con IA, se editan mientras
// sean borradores y el envío con confirmación es PB-087 (HU-076).
export function Correos({
  caso,
  formatearFecha,
}: {
  caso: DetalleCaso;
  formatearFecha: (iso: string) => string;
}) {
  const abierto = caso.estado_actual !== "CERRADO";

  return (
    <div id="correos" className="mt-6 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Correos al apoderado</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Se preparan como borrador y no se envían desde aquí: el envío necesita
        la confirmación de un profesional de Convivencia.
      </p>

      {caso.correos.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          El caso todavía no tiene correos.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border border-y border-border text-sm">
          {caso.correos.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                  {NOMBRE_ESTADO_CORREO[c.estado] ?? c.estado}
                </span>
                {c.generado_por_ia && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-foreground">
                    Generado con IA
                  </span>
                )}
              </div>
              <p className="mt-2 font-medium">{c.asunto || "Sin asunto"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Para {c.destinatario ?? "destinatario sin ficha"}
                {c.direccion ? ` · ${c.direccion}` : " · falta el correo"} ·
                preparado por {c.creado_por} el {formatearFecha(c.creado_en)}
              </p>
              {c.contenido && (
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-muted-foreground">
                  {c.contenido}
                </p>
              )}
              {c.editable && abierto && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-primary">
                    Revisar y editar
                  </summary>
                  <div className="mt-3 space-y-4">
                    <FormularioCorreo
                      casoId={caso.id}
                      destinatarios={caso.destinatarios_correo}
                      correo={c}
                    />
                    <BotonDescartarCorreo casoId={caso.id} correoId={c.id} />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {abierto ? (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <details
            className="rounded-2xl border border-border p-4"
            open={caso.correos.length === 0}
          >
            <summary className="cursor-pointer text-sm font-semibold">
              Redactar un correo
            </summary>
            <div className="mt-3">
              <FormularioCorreo
                casoId={caso.id}
                destinatarios={caso.destinatarios_correo}
              />
            </div>
          </details>
          <details className="rounded-2xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Preparar un borrador con IA
            </summary>
            <div className="mt-3">
              <FormularioCorreoIA
                casoId={caso.id}
                destinatarios={caso.destinatarios_correo}
              />
            </div>
          </details>
        </div>
      ) : (
        caso.correos.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            El caso está cerrado: sus correos se conservan como quedaron.
          </p>
        )
      )}
    </div>
  );
}
