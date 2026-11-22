import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { claseEnlace } from "@/app/components/formulario";
import type { DetalleConvivencia, RevisionNormativa } from "../../datos";
import { APLICABILIDAD, MODO_REVISION } from "./opciones";

export function AclaracionesGuardadas({ datos, fecha }: {
  datos: DetalleConvivencia["aclaraciones"];
  fecha: (iso: string) => string;
}) {
  return (
    <>
      {datos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no se han pedido aclaraciones.
        </p>
      ) : (
        <ul className="space-y-4">
          {datos.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-border p-4 text-sm"
            >
              <p className="font-medium">{a.pregunta}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pedida por {a.solicitado_por} el{" "}
                {fecha(a.solicitado_en)}
              </p>
              {a.estado === "RESPONDIDA" && a.respuesta ? (
                <div className="mt-3 border-l-2 border-verde pl-3">
                  <p className="whitespace-pre-line">{a.respuesta}</p>
                  {a.respondido_en && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Respondida el {fecha(a.respondido_en)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 inline-block rounded-full bg-naranjo px-2.5 py-0.5 text-xs font-semibold text-tinta">
                  Esperando respuesta del profesor
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function RevisionesGuardadas({ datos, fecha }: {
  datos: RevisionNormativa[];
  fecha: (iso: string) => string;
}) {
  return (
    <>
      {datos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no se registra lo que indica el reglamento o el protocolo.
        </p>
      ) : (
        <ul className="space-y-4">
          {datos.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-border p-4 text-sm"
            >
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                  {APLICABILIDAD[r.aplicabilidad] ?? r.aplicabilidad}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {MODO_REVISION[r.modo_revision] ?? r.modo_revision}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line">{r.fundamento}</p>
              {r.protocolo && (
                <p className="mt-2 text-muted-foreground">
                  Protocolo:{" "}
                  <span className="text-foreground">{r.protocolo}</span>
                </p>
              )}
              {r.referencias.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-muted-foreground">
                  {r.referencias.map((ref, n) => (
                    <li key={n}>
                      <Link
                        className={claseEnlace}
                        href={`/convivencia/documentos/versiones/${ref.version_documento_id}?pagina=${ref.pagina_desde ?? 1}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {ref.documento} ({ref.version})
                      </Link>
                      {ref.pagina_desde &&
                        (ref.pagina_hasta &&
                        ref.pagina_hasta !== ref.pagina_desde
                          ? `, páginas ${ref.pagina_desde} a ${ref.pagina_hasta}`
                          : `, página ${ref.pagina_desde}`)}
                      {ref.titulo_seccion && `, ${ref.titulo_seccion}`}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Registrada por {r.revisado_por} el{" "}
                {fecha(r.revisado_en)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
