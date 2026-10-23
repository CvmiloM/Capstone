import type { Metadata } from "next";
import { Encabezado } from "@/app/components/formulario";
import { obtenerFichaInstitucional } from "./datos";
import { FormularioFicha } from "./formulario-ficha";

export const metadata: Metadata = { title: "Establecimiento" };

export default async function PaginaEstablecimiento({
  searchParams,
}: {
  searchParams: Promise<{ ficha?: string }>;
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
        titulo="Establecimiento"
        descripcion="Mantén actualizados los datos institucionales y de contacto de tu escuela"
      />
      <div className="max-w-4xl space-y-6">
        {consulta.ficha === "guardada" && (
          <div
            role="status"
            className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm"
          >
            Ficha institucional guardada
          </div>
        )}
        <section
          aria-label="Identificación de la escuela"
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <h2 className="text-lg font-semibold">{ficha.nombre}</h2>
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
        </section>
        <section
          aria-label="Editar ficha institucional"
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <FormularioFicha ficha={ficha} />
        </section>
      </div>
    </>
  );
}
