import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { obtenerContextoAdmin } from "../../datos";
import { obtenerImportacion } from "../datos";
import { NOMBRE_ESTADO, NOMBRE_TIPO } from "../opciones";

export const metadata: Metadata = { title: "Importación" };

function tamano(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("es-CL")} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MB`;
}

// PB-019 (HU-015 CA2): la importación cargada con sus columnas y sus primeras
// filas, tal como venían en el archivo. CA5: nada se guardó en las fichas.
export default async function PaginaImportacion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [importacion, { escuela }] = await Promise.all([
    obtenerImportacion(id),
    obtenerContextoAdmin(),
  ]);

  if (!importacion) {
    return (
      <>
        <Link href="/admin/importaciones" className={`text-sm ${claseEnlace}`}>
          ← Importaciones
        </Link>
        <p className="mt-4 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No encontramos esa importación en tu escuela.
        </p>
      </>
    );
  }

  const creado = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: escuela.zonaHoraria,
  }).format(new Date(importacion.creado_en));
  const tipo =
    NOMBRE_TIPO[importacion.tipo_importacion] ?? importacion.tipo_importacion;
  const estado = NOMBRE_ESTADO[importacion.estado] ?? importacion.estado;

  return (
    <>
      <Link href="/admin/importaciones" className={`text-sm ${claseEnlace}`}>
        ← Importaciones
      </Link>

      <div className="mt-4">
        <Encabezado
          titulo={importacion.archivo_nombre}
          descripcion={`${tipo} · ${importacion.filas.toLocaleString("es-CL")} ${importacion.filas === 1 ? "fila" : "filas"} · ${tamano(importacion.archivo_bytes)} · ${estado} · Cargada por ${importacion.creado_por} el ${creado}`}
        />
      </div>

      <p
        role="note"
        className="mb-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
      >
        El archivo quedó guardado en el espacio privado de la escuela y sus
        filas se conservan tal como venían. Todavía no se guardó nada en las
        fichas.
      </p>

      <section aria-labelledby="titulo-filas">
        <h2 id="titulo-filas" className="mb-3 text-lg font-semibold">
          Filas del archivo
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {importacion.filas > importacion.muestra.length
            ? `Se muestran las primeras ${importacion.muestra.length} de ${importacion.filas.toLocaleString("es-CL")} filas.`
            : `Se muestran las ${importacion.muestra.length} filas.`}{" "}
          El número es la fila en el archivo.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-tarjeta">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Filas de {importacion.archivo_nombre}
            </caption>
            <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Fila
                </th>
                {importacion.columnas.map((columna) => (
                  <th
                    key={columna}
                    scope="col"
                    className="px-4 py-3 font-semibold whitespace-nowrap"
                  >
                    {columna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {importacion.muestra.map((fila) => (
                <tr key={fila.numero_fila}>
                  <th
                    scope="row"
                    className="px-4 py-3 font-normal tabular-nums text-muted-foreground"
                  >
                    {fila.numero_fila}
                  </th>
                  {importacion.columnas.map((columna) => (
                    <td key={columna} className="px-4 py-3 whitespace-pre-line">
                      {fila.datos_originales[columna] || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}