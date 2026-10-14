import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { BotonActivo } from "./boton-activo";
import { obtenerNiveles } from "./datos";
import { FormularioNivel } from "./formulario-nivel";
import { NOMBRE_CICLO, nombreTramo } from "./opciones";

export const metadata: Metadata = { title: "Niveles educativos" };

// PB-014 (HU-012): niveles educativos de la escuela, en el orden que ella
// define. Los cursos se agrupan por el ciclo y el tramo de su nivel (CA3).
export default async function PaginaNiveles() {
  const niveles = await obtenerNiveles();

  return (
    <>
      <Encabezado
        titulo="Niveles educativos"
        descripcion="Los niveles con que se agrupan los cursos, del primero al último. Un nivel no se borra: si deja de usarse, desactívalo y los cursos que ya lo tienen lo conservan."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <section aria-labelledby="titulo-niveles" className="xl:col-span-2">
          <h2 id="titulo-niveles" className="sr-only">
            Niveles registrados
          </h2>
          {niveles.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Todavía no hay niveles. Crea el primero con el formulario.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-tarjeta">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Niveles educativos de la escuela
                </caption>
                <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Orden
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Nivel
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Ciclo y tramo
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Cursos
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {niveles.map((nivel) => (
                    <tr key={nivel.id}>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {nivel.orden}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{nivel.nombre}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{nivel.codigo}</span>
                          {!nivel.activo && (
                            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                              Inactivo
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{NOMBRE_CICLO[nivel.ciclo]}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {nombreTramo(nivel.tramo)}
                        </p>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{nivel.cursos}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/admin/niveles/${nivel.id}`}
                            className={`text-sm ${claseEnlace}`}
                          >
                            Editar
                          </Link>
                          <BotonActivo id={nivel.id} activo={nivel.activo} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="titulo-nuevo"
          className="h-fit rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
        >
          <h2 id="titulo-nuevo" className="mb-4 text-lg font-semibold">
            Nuevo nivel
          </h2>
          <FormularioNivel />
        </section>
      </div>
    </>
  );
}