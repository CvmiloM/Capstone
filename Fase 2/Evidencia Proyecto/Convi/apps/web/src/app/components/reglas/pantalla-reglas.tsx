import Link from "next/link";
import { claseBotonPrimario } from "@/app/components/formulario";
import type { Regla } from "./datos";
import {
  CLASE_ESTADO,
  describirRegla,
  describirVigencia,
  NOMBRE_ACCION,
  NOMBRE_ESTADO,
  NOMBRE_PRIORIDAD,
  NOMBRE_TIPO,
} from "./opciones";

const ORDEN_ESTADO = { ACTIVO: 0, BORRADOR: 1, ARCHIVADO: 2 } as const;

/**
 * PB-089 (HU-078): las reglas de la escuela, una tarjeta por regla con la
 * versión que importa: la activa, o si no hay, la más nueva. Primero las
 * activas, luego los borradores y al final las archivadas. La misma pantalla
 * está en los portales de administración y de Convivencia.
 */
export function PantallaReglas({
  portal,
  reglas,
}: {
  portal: "admin" | "convivencia";
  reglas: Regla[];
}) {
  const base = portal === "admin" ? "/admin/reglas" : "/convivencia/reglas";
  const porCodigo = new Map<string, Regla[]>();
  for (const regla of reglas)
    porCodigo.set(regla.codigo_regla, [...(porCodigo.get(regla.codigo_regla) ?? []), regla]);
  const grupos = [...porCodigo.values()]
    .map((versiones) => {
      const ordenadas = [...versiones].sort((a, b) => b.numero_version - a.numero_version);
      const principal = ordenadas.find((v) => v.estado === "ACTIVO") ?? ordenadas[0];
      const borrador = ordenadas.find((v) => v.estado === "BORRADOR" && v.id !== principal.id);
      return { principal, borrador, versiones: ordenadas.length };
    })
    .sort(
      (a, b) =>
        ORDEN_ESTADO[a.principal.estado] - ORDEN_ESTADO[b.principal.estado] ||
        a.principal.codigo_regla.localeCompare(b.principal.codigo_regla),
    );

  return (
    <>
      <div className="mb-6">
        <Link href={`${base}/nueva`} className={claseBotonPrimario}>
          Nueva regla
        </Link>
      </div>

      {grupos.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Tu escuela todavía no tiene reglas de aviso, crea la primera para que CONVI avise cuando algo se repite o vence.
        </p>
      ) : (
        <ul className="space-y-3">
          {grupos.map(({ principal, borrador, versiones }) => (
            <li key={principal.codigo_regla}>
              <Link
                href={`${base}/${principal.id}`}
                className="block rounded-2xl border border-border bg-card p-5 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs text-muted-foreground">{principal.codigo_regla}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASE_ESTADO[principal.estado]}`}>
                    {NOMBRE_ESTADO[principal.estado]}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {NOMBRE_TIPO[principal.tipo_regla]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Versión {principal.numero_version}
                    {versiones > 1 ? ` de ${versiones}` : ""}
                  </span>
                </div>
                <h2 className="mt-2 text-base font-semibold">{principal.nombre}</h2>
                <p className="mt-1 text-sm">{describirRegla(principal)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[
                    `Prioridad ${NOMBRE_PRIORIDAD[principal.codigo_prioridad]?.toLowerCase() ?? principal.codigo_prioridad}`,
                    NOMBRE_ACCION[principal.codigo_accion],
                    describirVigencia(principal.vigente_desde, principal.vigente_hasta),
                  ].join(" · ")}
                </p>
                {borrador && (
                  <p className="mt-2 text-sm font-medium text-tinta">
                    Hay un borrador de la versión {borrador.numero_version} sin activar
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
