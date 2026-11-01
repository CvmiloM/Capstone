import type { Metadata } from "next";
import { Encabezado } from "@/app/components/formulario";
import { obtenerFichaInstitucional } from "./datos";
import { FormularioFicha } from "./formulario-ficha";
import { FormularioConfiguracion } from "./formulario-configuracion";

export const metadata: Metadata = { title: "Establecimiento" };

export default async function PaginaEstablecimiento({
  searchParams,
}: {
  searchParams: Promise<{ ficha?: string; configuracion?: string }>;
}) {
  const [ficha, consulta] = await Promise.all([
    obtenerFichaInstitucional(),
    searchParams,
  ]);
  const fecha = (valor: string) =>
    new Intl.DateTimeFormat("es-CL", {
      timeZone: ficha.zona_horaria,
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(valor));
  return (
    <>
      <Encabezado
        titulo="Establecimiento, Fechas y Plazos"
        descripcion="Mantén actualizados los datos institucionales y de contacto de tu escuela"
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        {(consulta.ficha === "guardada" ||
          consulta.configuracion === "guardada") && (
          <div
            role="status"
            className="xl:col-span-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm"
          >
            {consulta.configuracion === "guardada"
              ? "Configuración de fechas y plazos guardada"
              : "Ficha institucional guardada"}
          </div>
        )}
        <section
          aria-label="Identificación de la escuela"
          className={`xl:col-start-2 ${consulta.ficha === "guardada" || consulta.configuracion === "guardada" ? "xl:row-start-2" : "xl:row-start-1"} xl:row-span-2 rounded-2xl border border-border bg-card p-5 sm:p-6`}
        >
          <h2 className="font-titulo text-2xl font-semibold">{ficha.nombre}</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Incorporación a CONVI</dt>
              <dd className="mt-1 font-medium">{fecha(ficha.creado_en)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Última actualización</dt>
              <dd className="mt-1 font-medium">
                {fecha(ficha.actualizado_en)}
              </dd>
            </div>
          </dl>
          <dl className="mt-6 space-y-4 border-t border-border pt-5 text-sm">
            {[
              ["RBD", ficha.codigo],
              ["Región", ficha.region],
              ["Comuna", ficha.comuna],
              ["Dirección", ficha.direccion],
              ["Teléfono", ficha.telefono],
              ["Correo de contacto", ficha.correo_contacto],
              ["Zona horaria", ficha.zona_horaria],
              [
                "Plazo sugerido de cierre de casos",
                ficha.plazo_cierre_dias === null
                  ? "Sin plazo sugerido"
                  : `${ficha.plazo_cierre_dias} días`,
              ],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt className="text-muted-foreground">{etiqueta}</dt>
                <dd className="mt-1 break-words font-medium">
                  {valor || "Sin registrar"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section
          aria-label="Editar ficha institucional"
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <FormularioFicha ficha={ficha} />
        </section>
        <section
          aria-label="Fechas y plazos"
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <FormularioConfiguracion key={ficha.actualizado_en} ficha={ficha} />
        </section>
      </div>
    </>
  );
}
