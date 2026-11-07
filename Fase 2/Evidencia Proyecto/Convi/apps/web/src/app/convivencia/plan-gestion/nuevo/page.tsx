import { connection } from "next/server";
import { randomUUID } from "node:crypto";
import { Encabezado, claseEnlace } from "@/app/components/formulario";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { FormularioGestion } from "../formulario";
import { RAIZ } from "../opciones";

export const metadata = { title: "Crear Plan de Gestión" };
export default async function NuevoPlan() {
  await connection();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={RAIZ} className={`mb-5 inline-block text-sm ${claseEnlace}`}>
        Volver a los planes
      </Link>
      <Encabezado
        titulo="Crear Plan de Gestión"
        descripcion="Prepara el Plan de Convivencia del año, revisa lo escrito antes de guardarlo."
      />
      <section
        className="rounded-2xl border border-border bg-card p-5 sm:p-7"
        aria-label="Preparación del Plan"
      >
        <FormularioGestion
          contexto={{ tipo: "planes", operacion: "crear" }}
          confirmacion={randomUUID()}
        />
      </section>
    </div>
  );
}
