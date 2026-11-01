import type { Metadata } from "next";
import Link from "next/link";
import {
  claseBotonSecundario,
  claseEnlace,
  Encabezado,
} from "@/app/components/formulario";
import { irAlPortal, omitirPaso } from "./acciones";
import { obtenerGuia } from "./datos";
import { DemoPaso } from "./demo/demo-paso";
import { FormularioBienvenida } from "./formulario-bienvenida";
import { FormularioCursos } from "./formulario-cursos";
import {
  CLASE_ESTADO_PASO,
  formatoFecha,
  NOMBRE_ESTADO_PASO,
  PASOS,
  type ClavePaso,
} from "./opciones";

export const metadata: Metadata = { title: "Guía inicial" };

const AVISOS: Record<string, { texto: string; error?: boolean }> = {
  guardado: { texto: "La respuesta de la bienvenida quedó guardada." },
  omitido: {
    texto:
      "El paso quedó omitido: no se creó nada y puedes volver a él cuando quieras.",
  },
  "cursos-creados": {
    texto: "El año, los niveles y los cursos quedaron creados.",
  },
  desactualizada: {
    texto:
      "Otra persona avanzó la guía mientras la mirabas. Revisa su avance e inténtalo nuevamente.",
    error: true,
  },
  error: { texto: "Recarga la página e inténtalo nuevamente.", error: true },
};

// PB-032 (HU-025), PB-034 (HU-027) y PB-038 (HU-031): guía inicial del
// administrador. Al volver se retoma en el primer paso pendiente (CA2) y se
// puede abrir cualquier paso desde la lista.
export default async function GuiaInicial({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string; aviso?: string }>;
}) {
  const [parametros, guia] = await Promise.all([searchParams, obtenerGuia()]);
  const fecha = formatoFecha(guia.zona_horaria);
  const actual: ClavePaso =
    PASOS.find((p) => p.clave === parametros.paso)?.clave ?? guia.paso_actual;
  const paso = PASOS.find((p) => p.clave === actual)!;
  const estadoPaso = guia.pasos.find((p) => p.clave === actual)!;
  const indice = PASOS.indexOf(paso);
  const anterior = PASOS[indice - 1];
  const siguiente = PASOS[indice + 1];
  const aviso = parametros.aviso ? AVISOS[parametros.aviso] : undefined;
  const anioPorDefecto =
    guia.academico.anios.find(
      (a) => a.estado === "ACTIVO" || a.estado === "PLANIFICADO",
    )?.anio ?? new Date().getFullYear();

  if (guia.terminada_en)
    return (
      <>
        <Encabezado titulo="Guía inicial" />
        <p className="rounded-2xl border border-border bg-card p-6 text-sm">
          La guía terminó el {fecha(guia.terminada_en)}. Lo configurado se
          sigue editando desde las secciones del portal.{" "}
          <Link href="/admin" className={claseEnlace}>
            Volver al Resumen
          </Link>
        </p>
      </>
    );

  return (
    <>
      {/* Mientras la guía está en curso, el layout oculta el menú del portal. */}
      <span data-modo-guia="" hidden />
      <Encabezado
        titulo="Guía inicial"
        descripcion="Configura tu escuela paso a paso. Puedes omitir pasos y volver más tarde: lo avanzado queda guardado."
      />

      {aviso && (
        <div
          role={aviso.error ? "alert" : "status"}
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            aviso.error
              ? "border-destructive/20 bg-destructive/5 text-destructive"
              : "border-verde/30 bg-verde/10"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Pasos de la guía">
          <ol className="space-y-1.5">
            {PASOS.map((p, i) => {
              const e = guia.pasos.find((x) => x.clave === p.clave)!;
              const activo = p.clave === actual;
              return (
                <li key={p.clave}>
                  <Link
                    href={`/admin/guia?paso=${p.clave}`}
                    aria-current={activo ? "step" : undefined}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring ${
                      activo ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <span>
                      {i + 1}. {p.titulo}
                    </span>
                    {p.clave !== "fin" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${CLASE_ESTADO_PASO[e.estado]}`}
                      >
                        {NOMBRE_ESTADO_PASO[e.estado]}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
          {!guia.iniciada && (
            <form action={irAlPortal} className="mt-4">
              <input type="hidden" name="version" value={guia.version} />
              <button type="submit" className={`w-full ${claseBotonSecundario}`}>
                Ir al portal por ahora
              </button>
            </form>
          )}
          {guia.iniciada && (
            <Link href="/admin" className={`mt-4 block text-sm ${claseEnlace}`}>
              Volver al Resumen
            </Link>
          )}
        </nav>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Paso {indice + 1} de {PASOS.length}
          </p>
          <h2 className="mt-1 text-xl font-semibold">{paso.titulo}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <dt className="font-medium">Qué se prepara</dt>
              <dd className="mt-1 text-muted-foreground">{paso.prepara}</dd>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <dt className="font-medium">Qué ocurre al confirmar</dt>
              <dd className="mt-1 text-muted-foreground">{paso.alConfirmar}</dd>
            </div>
          </dl>
          {estadoPaso.estado !== "PENDIENTE" && estadoPaso.en && (
            <p className="mt-3 text-sm text-muted-foreground">
              {NOMBRE_ESTADO_PASO[estadoPaso.estado]} el {fecha(estadoPaso.en)}
              {estadoPaso.por_nombre ? ` por ${estadoPaso.por_nombre}` : ""}.
              {estadoPaso.estado === "OMITIDO" &&
                " Omitir no cuenta como configurado."}
            </p>
          )}

          {/* Cómo se hace este paso, animado con datos de ejemplo. */}
          <div className="mt-6">
            <DemoPaso key={actual} paso={actual} />
          </div>

          <div className="mt-6">
            {actual === "bienvenida" && (
              <FormularioBienvenida
                version={guia.version}
                metodo={guia.metodo_registro_actual}
                otro={guia.bienvenida.otro}
                mejorar={guia.bienvenida.mejorar}
              />
            )}
            {actual === "cursos" && (
              <FormularioCursos
                version={guia.version}
                academico={guia.academico}
                anioPorDefecto={anioPorDefecto}
              />
            )}
            {paso.enlaces && (
              <p className="flex flex-wrap gap-4 text-sm">
                {paso.enlaces.map((e) => (
                  <Link key={e.href} href={e.href} className={claseEnlace}>
                    {e.texto}
                  </Link>
                ))}
              </p>
            )}
            {actual === "fin" && (
              <p className="text-sm text-muted-foreground">
                Este paso estará disponible pronto. Mientras tanto, el Resumen
                del portal muestra las cifras de tu escuela.
              </p>
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            {anterior && (
              <Link href={`/admin/guia?paso=${anterior.clave}`} className={claseEnlace}>
                Anterior
              </Link>
            )}
            {actual !== "bienvenida" &&
              actual !== "fin" &&
              estadoPaso.estado !== "LISTO" && (
                <form action={omitirPaso}>
                  <input type="hidden" name="paso" value={actual} />
                  <input type="hidden" name="version" value={guia.version} />
                  <button type="submit" className={claseBotonSecundario}>
                    Omitir por ahora
                  </button>
                </form>
              )}
            {siguiente && (
              <Link
                href={`/admin/guia?paso=${siguiente.clave}`}
                className={`ml-auto ${claseEnlace}`}
              >
                Siguiente: {siguiente.titulo}
              </Link>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
