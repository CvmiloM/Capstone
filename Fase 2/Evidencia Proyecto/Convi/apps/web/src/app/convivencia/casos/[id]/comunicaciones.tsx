import { claseEnlace } from "@/app/components/formulario";
import type { DetalleCaso } from "../datos";
import { FormularioComunicacion } from "./formulario-comunicacion";
import { NOMBRE_ROL_ASISTENTE, NOMBRE_TIPO_COMUNICACION } from "./opciones";

// PB-067 (HU-058): llamadas, conversaciones presenciales, comunicaciones
// institucionales y otros contactos del caso, de la más reciente a la más
// antigua. Decisión del PO (por defecto): una comunicación no se edita ni se
// borra, y un caso cerrado no recibe nuevas.
export function Comunicaciones({
  caso,
  formatearFecha,
}: {
  caso: DetalleCaso;
  formatearFecha: (iso: string) => string;
}) {
  const abierto = caso.estado_actual !== "CERRADO";

  return (
    <>
      {caso.comunicaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          El caso todavía no tiene comunicaciones registradas.
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border text-sm">
          {caso.comunicaciones.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                  {NOMBRE_TIPO_COMUNICACION[c.tipo] ?? c.tipo}
                </span>
                {c.advertencia && (
                  <span className="rounded-full bg-naranjo/15 px-2.5 py-0.5 text-xs font-medium text-foreground">
                    Contacto con advertencia
                  </span>
                )}
              </div>
              <p className="mt-2">
                <span className="font-medium">{c.destinatario}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {c.rol ? (NOMBRE_ROL_ASISTENTE[c.rol] ?? c.rol) : "Fuera del caso"}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-line">{c.resumen}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ocurrió el {formatearFecha(c.ocurrido_en)} · registrada por{" "}
                {c.creado_por} el {formatearFecha(c.creado_en)}
              </p>
              {c.advertencia && (
                <p className="mt-1 text-xs text-muted-foreground">
                  El vínculo indica que este apoderado no puede ser contactado;
                  la advertencia quedó en la auditoría.
                </p>
              )}
              {c.respaldo && (
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  Respaldo: {c.respaldo} ·{" "}
                  <a
                    href={`/convivencia/comunicaciones/${c.id}/respaldo`}
                    className={claseEnlace}
                  >
                    Descargar
                  </a>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {abierto ? (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-3 text-sm font-semibold">Registrar una comunicación</h3>
          <FormularioComunicacion
            casoId={caso.id}
            destinatarios={caso.destinatarios_comunicacion}
            ahora={caso.ahora}
          />
        </div>
      ) : (
        caso.comunicaciones.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            El caso está cerrado: sus comunicaciones se conservan como quedaron.
          </p>
        )
      )}
    </>
  );
}
