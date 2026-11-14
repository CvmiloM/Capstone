import { AccionesComunicacion } from "./paneles-comunicacion";
import { randomUUID } from "node:crypto";
import type { DetalleCaso } from "../datos";
import {
  BotonCopiarCorreo,
  BotonEnviarCorreo,
  BotonRevisarEntrega,
} from "./envio-correo";
import { BotonDescartarCorreo, FormularioCorreo } from "./formulario-correo";
import { FormularioCorreoIA } from "./formulario-correo-ia";
import { NOMBRE_ESTADO_CORREO } from "./opciones";

// PB-151 (HU-130) y PB-086 (HU-075): correos al apoderado del caso, del más
// reciente al más antiguo. Se redactan a mano o con IA y se editan mientras
// sean borradores. PB-087 (HU-076): Convivencia confirma y se envía; lo
// enviado no cambia y se copia en un borrador nuevo para corregirlo.
// PB-088 (HU-077): el estado de entrega lo informa el servicio de correo, y un
// rebote o un fallo muestran su detalle con la referencia.
export function Correos({
  caso,
  formatearFecha,
  redactar,
}: {
  caso: DetalleCaso;
  redactar: boolean;
  formatearFecha: (iso: string) => string;
}) {
  const abierto = caso.estado_actual !== "CERRADO";

  return (
    <section id="correos" aria-labelledby="titulo-correos" className="rounded-xl border border-border bg-muted/25 p-4 sm:p-5">
      <h3 id="titulo-correos" className="text-base font-semibold">Correos al apoderado</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Revisa el borrador y confirma el envío cuando esté listo.
      </p>
      {abierto && (
        <div id="redactar-correo" className="mt-4 scroll-mt-4">
          <AccionesComunicacion inicial={redactar ? "manual" : undefined} acciones={[
            {
              clave: "manual",
              titulo: "Redactar un correo",
              icono: "mensaje",
              principal: true,
              formulario: <FormularioCorreo casoId={caso.id} destinatarios={caso.destinatarios_correo} />,
            },
            {
              clave: "ia",
              titulo: "Preparar un borrador con IA",
              icono: "documentos",
              formulario: <FormularioCorreoIA casoId={caso.id} destinatarios={caso.destinatarios_correo} />,
            },
          ]} />
        </div>
      )}

      {caso.correos.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          El caso todavía no tiene correos.
        </p>
      ) : (
        <ul className="mt-4 space-y-3 text-sm">
          {caso.correos.map((c) => {
            const advertencia =
              caso.destinatarios_correo.find(
                (d) => d.persona_id === c.persona_destinataria_id,
              )?.no_contactable ?? false;
            // Un rebote temporal puede terminar entregado: se vuelve a revisar.
            const revisable =
              (c.estado === "ENVIADO" || c.estado === "REBOTADO") &&
              Boolean(c.referencia);
            const problema = c.estado === "REBOTADO" || c.estado === "FALLIDO";
            return (
              <li key={c.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      problema
                        ? "bg-destructive/10 text-destructive"
                        : c.estado === "ENTREGADO"
                          ? "bg-verde/15 text-foreground"
                          : "bg-accent text-accent-foreground"
                    }`}
                  >
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
                {(c.confirmado_en || c.enviado_en) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {c.enviado_en
                      ? `Enviado el ${formatearFecha(c.enviado_en)}`
                      : `Confirmado el ${formatearFecha(c.confirmado_en!)}`}
                    {c.confirmado_por ? ` · confirmado por ${c.confirmado_por}` : ""}
                    {c.referencia ? ` · referencia ${c.referencia}` : ""}
                  </p>
                )}
                {c.estado === "ENVIADO" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    El servicio de correo aún no confirma la entrega.
                  </p>
                )}
                {c.estado === "PENDIENTE" && (
                  <p className="mt-2 rounded-lg border border-border bg-muted p-3 text-sm">
                    Envío confirmado, pendiente de verificar su resultado. Para evitar duplicados, no se reenviará automáticamente.
                    Revisa el proveedor antes de crear otro correo.
                  </p>
                )}
                {problema && (
                  <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs">
                    <p className="font-medium text-destructive">
                      {c.estado === "FALLIDO"
                        ? "El servicio de correo no pudo entregarlo"
                        : "El correo rebotó"}
                    </p>
                    {c.detalle_error && (
                      <p className="mt-1 text-foreground">{c.detalle_error}</p>
                    )}
                    {c.referencia && (
                      <p className="mt-1 text-muted-foreground">
                        Referencia del proveedor: {c.referencia}
                      </p>
                    )}
                  </div>
                )}
                {!c.editable && (revisable || abierto) && (
                  <div className="mt-3 flex flex-wrap items-start gap-2">
                    {revisable && (
                      <BotonRevisarEntrega casoId={caso.id} correoId={c.id} />
                    )}
                    {abierto && (
                      <BotonCopiarCorreo casoId={caso.id} correoId={c.id} />
                    )}
                  </div>
                )}
                {c.editable && abierto && (
                  <div className="mt-3">
                    <AccionesComunicacion acciones={[{
                      clave: "editar",
                      titulo: "Revisar y editar",
                      icono: "editar",
                      formulario: (
                        <div className="space-y-4">
                          <FormularioCorreo
                            casoId={caso.id}
                            destinatarios={caso.destinatarios_correo}
                            correo={c}
                          />
                          <BotonDescartarCorreo casoId={caso.id} correoId={c.id} />
                        </div>
                      ),
                    }]} />
                  </div>
                )}
                {c.editable && abierto && (
                  <div className="mt-3 rounded-xl border border-border p-3">
                    <p className="text-sm font-medium">Confirmar y enviar</p>
                    <p className="mt-1 mb-3 text-xs text-muted-foreground">
                      Se envía tal cual
                      {c.direccion ? ` a ${c.direccion}` : ""}, con tu nombre como
                      quien confirmó. Después no se edita: para cambiarlo se usa
                      como borrador nuevo.
                    </p>
                    <BotonEnviarCorreo
                      casoId={caso.id}
                      correoId={c.id}
                      claveEnvio={randomUUID()}
                      advertencia={advertencia}
                      completo={Boolean(c.direccion && c.asunto && c.contenido)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!abierto && caso.correos.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            El caso está cerrado: sus correos se conservan como quedaron.
          </p>
      )}
    </section>
  );
}
