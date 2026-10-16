import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { obtenerContextoAdmin } from "../datos";
import { obtenerImportaciones } from "./datos";
import { FormularioCarga } from "./formulario-carga";
import { NOMBRE_ESTADO, NOMBRE_TIPO, type TipoImportacion } from "./opciones";

export const metadata: Metadata = { title: "Importaciones" };

// PB-019 y PB-020 (HU-015): importaciones administrativas de la escuela.
// Cargar un archivo solo lo guarda con sus filas; nada llega a las fichas
// hasta confirmar la importación (CA5). Cada tipo tiene su plantilla XLSX.
export default async function PaginaImportaciones() {
  const [importaciones, { escuela }] = await Promise.all([
    obtenerImportaciones(),
    obtenerContextoAdmin(),
  ]);
  // Fecha y hora en la zona horaria de la escuela.
  const formatoFecha = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: escuela.zonaHoraria,
  });

  return (
    <>
      <Encabezado
        titulo="Importaciones"
        descripcion="Carga un archivo CSV o XLSX con estudiantes, cursos, profesores, apoderados, matrículas o asignaciones. Primero se guarda tal como viene y revisas cada fila; nada llega a las fichas hasta confirmar la importación."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <section aria-labelledby="titulo-lista" className="xl:col-span-2">
          <h2 id="titulo-lista" className="sr-only">
            Importaciones de la escuela
          </h2>
          {importaciones.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Todavía no hay importaciones. Carga el primer archivo con el
              formulario.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-tarjeta">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Importaciones de la escuela
                </caption>
                <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Archivo
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Datos
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Filas
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {importaciones.map((importacion) => (
                    <tr key={importacion.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/importaciones/${importacion.id}`}
                          className={`font-medium break-all ${claseEnlace}`}
                        >
                          {importacion.archivo_nombre}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatoFecha.format(new Date(importacion.creado_en))}{" "}
                          · {importacion.creado_por}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {NOMBRE_TIPO[importacion.tipo_importacion] ??
                          importacion.tipo_importacion}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {importacion.filas.toLocaleString("es-CL")}
                      </td>
                      <td className="px-4 py-3">
                        {NOMBRE_ESTADO[importacion.estado] ??
                          importacion.estado}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="h-fit space-y-6">
          <section
            aria-labelledby="titulo-nueva"
            className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
          >
            <h2 id="titulo-nueva" className="mb-4 text-lg font-semibold">
              Nueva importación
            </h2>
            <FormularioCarga />
          </section>

          <section
            aria-labelledby="titulo-plantillas"
            className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
          >
            <h2 id="titulo-plantillas" className="text-lg font-semibold">
              Plantillas
            </h2>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
              Cada plantilla trae los títulos que CONVI reconoce solos, una fila
              de ejemplo y una hoja con instrucciones para llenarla.
            </p>
            <ul className="space-y-1.5 text-sm">
              {(Object.keys(NOMBRE_TIPO) as TipoImportacion[]).map((tipo) => (
                <li key={tipo}>
                  <a
                    href={`/admin/importaciones/plantillas/${tipo.toLowerCase()}`}
                    download
                    className={claseEnlace}
                  >
                    Plantilla de {NOMBRE_TIPO[tipo].toLowerCase()}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}