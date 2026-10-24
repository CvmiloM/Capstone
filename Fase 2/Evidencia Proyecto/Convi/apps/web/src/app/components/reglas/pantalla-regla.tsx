import Link from "next/link";
import type { ReactNode } from "react";
import { claseEnlace } from "@/app/components/formulario";
import { BotonRegla } from "./boton-regla";
import type { DetalleRegla, Regla } from "./datos";
import { FormularioRegla } from "./formulario-regla";
import {
  CLASE_ESTADO,
  cuentaVencidos,
  describirRegla,
  describirVigencia,
  NOMBRE_ACCION,
  NOMBRE_AMBITO,
  NOMBRE_ESTADO,
  NOMBRE_PRIORIDAD,
  NOMBRE_TIPO,
} from "./opciones";

const AVISOS = {
  guardada: "Guardaste el borrador, cuando esté listo actívalo para que empiece a generar alertas.",
  activada: "Activaste la regla, desde ahora es la versión que se usa para generar alertas.",
  archivada: "Archivaste esta versión, se conserva pero ya no genera alertas.",
} as const;

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{nombre}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

/**
 * PB-089 (HU-078): una versión de una regla con sus acciones y todas las
 * versiones de la misma regla. Un borrador se edita y se activa, una regla
 * activa se archiva o se cambia creando una versión nueva (CA6), y una
 * archivada solo sirve de base para otra versión (decisión del PO).
 */
export function PantallaRegla({
  portal,
  detalle,
  categorias,
  aviso,
}: {
  portal: "admin" | "convivencia";
  detalle: DetalleRegla;
  categorias: { id: string; nombre: string }[];
  aviso: keyof typeof AVISOS | null;
}) {
  const { regla, versiones } = detalle;
  const base = portal === "admin" ? "/admin/reglas" : "/convivencia/reglas";
  const activa = versiones.find((v) => v.estado === "ACTIVO" && v.id !== regla.id);
  const borrador = versiones.find((v) => v.estado === "BORRADOR" && v.id !== regla.id);

  return (
    <>
      <Link href={base} className={`text-sm ${claseEnlace}`}>
        ← Reglas de aviso
      </Link>

      <div className="mt-4 mb-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-sm text-muted-foreground">{regla.codigo_regla}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASE_ESTADO[regla.estado]}`}>
            {NOMBRE_ESTADO[regla.estado]}
          </span>
          <span className="text-sm text-muted-foreground">Versión {regla.numero_version}</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{regla.nombre}</h1>
        <p className="mt-1.5 text-sm">{describirRegla(regla)}</p>
      </div>

      {aviso && (
        <div role="status" className="mb-6 max-w-3xl rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm">
          {AVISOS[aviso]}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {regla.estado === "BORRADOR" ? (
            <section aria-labelledby="titulo-editar" className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
              <h2 id="titulo-editar" className="mb-4 text-lg font-semibold">
                Editar el borrador
              </h2>
              <FormularioRegla portal={portal} regla={regla} categorias={categorias} />
            </section>
          ) : (
            <section aria-labelledby="titulo-datos" className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
              <h2 id="titulo-datos" className="mb-4 text-lg font-semibold">
                Datos de la regla
              </h2>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <Dato nombre="Tipo">{NOMBRE_TIPO[regla.tipo_regla]}</Dato>
                <Dato nombre="Qué cuenta">{NOMBRE_AMBITO[regla.codigo_ambito]}</Dato>
                {!cuentaVencidos(regla.tipo_regla) && (
                  <Dato nombre="Categoría">{regla.categoria ?? "Todas las categorías"}</Dato>
                )}
                <Dato nombre="Al cumplirse">{NOMBRE_ACCION[regla.codigo_accion]}</Dato>
                <Dato nombre="Prioridad">{NOMBRE_PRIORIDAD[regla.codigo_prioridad]}</Dato>
                <Dato nombre="Vigencia">{describirVigencia(regla.vigente_desde, regla.vigente_hasta)}</Dato>
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">
                {regla.estado === "ACTIVO"
                  ? "Una regla activa no se edita, para cambiarla crea una versión nueva y actívala."
                  : "Una regla archivada no se vuelve a activar, para usarla otra vez crea una versión nueva a partir de ella."}
              </p>
            </section>
          )}

          <section aria-labelledby="titulo-versiones" className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
            <h2 id="titulo-versiones" className="mb-3 text-lg font-semibold">
              Versiones
            </h2>
            <ol className="divide-y divide-border text-sm">
              {versiones.map((v: Regla) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="flex flex-wrap items-center gap-2">
                    {v.id === regla.id ? (
                      <span className="font-medium">Versión {v.numero_version} (esta)</span>
                    ) : (
                      <Link href={`${base}/${v.id}`} className={`font-medium ${claseEnlace}`}>
                        Versión {v.numero_version}
                      </Link>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO[v.estado]}`}>
                      {NOMBRE_ESTADO[v.estado]}
                    </span>
                  </span>
                  <span className="text-muted-foreground">{describirVigencia(v.vigente_desde, v.vigente_hasta)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside aria-labelledby="titulo-acciones" className="h-fit space-y-4 rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
          <h2 id="titulo-acciones" className="text-lg font-semibold">
            Acciones
          </h2>
          {regla.estado === "BORRADOR" && (
            <>
              {regla.tipo_regla === "OTRO" ? (
                <p className="text-sm text-muted-foreground">
                  Una regla de tipo Otro no se activa porque no tiene un cálculo definido, cambia su tipo para poder activarla.
                </p>
              ) : (
                <BotonRegla
                  portal={portal}
                  id={regla.id}
                  accion="activar"
                  texto="Activar esta versión"
                  textoPendiente="Activando…"
                  principal
                  confirmar={
                    activa
                      ? `Al activarla se archiva la versión ${activa.numero_version}, que está activa ahora, ¿quieres continuar?`
                      : "La regla empezará a generar alertas, ¿quieres activarla?"
                  }
                />
              )}
              <BotonRegla
                portal={portal}
                id={regla.id}
                accion="archivar"
                texto="Descartar el borrador"
                textoPendiente="Descartando…"
                confirmar="El borrador queda archivado y no se puede activar, ¿quieres descartarlo?"
              />
            </>
          )}
          {regla.estado !== "BORRADOR" &&
            (borrador ? (
              <p className="text-sm">
                Ya hay un borrador de la versión {borrador.numero_version},{" "}
                <Link href={`${base}/${borrador.id}`} className={claseEnlace}>
                  ábrelo para seguir editándolo
                </Link>
              </p>
            ) : (
              <BotonRegla
                portal={portal}
                id={regla.id}
                accion="version"
                texto="Crear una versión nueva"
                textoPendiente="Creando…"
                principal
              />
            ))}
          {regla.estado === "ACTIVO" && (
            <BotonRegla
              portal={portal}
              id={regla.id}
              accion="archivar"
              texto="Archivar la regla"
              textoPendiente="Archivando…"
              confirmar="La regla deja de generar alertas y no se puede volver a activar, ¿quieres archivarla?"
            />
          )}
        </aside>
      </div>
    </>
  );
}
