import Link from "next/link";
import { claseBotonSecundario } from "@/app/components/formulario";
import type { DetalleImportacion } from "../datos";
import { type EstadoFila, NOMBRE_ESTADO_FILA, NOMBRE_ROL } from "../opciones";

// PB-020 (HU-015 CA4): la vista previa de una importación. Antes de revisar
// muestra las filas tal como venían; después, cada fila con su estado, sus
// datos ya normalizados y cada problema junto a su campo.

// Igual que FILAS_POR_PAGINA de la API.
const POR_PAGINA = 50;

const FILTROS: { estado: EstadoFila | null; nombre: string }[] = [
  { estado: null, nombre: "Todas" },
  { estado: "VALIDO", nombre: "Válidas" },
  { estado: "ADVERTENCIA", nombre: "Con advertencia" },
  { estado: "ERROR", nombre: "Con error" },
];

const ESTILO_ESTADO: Partial<Record<EstadoFila, string>> = {
  VALIDO: "border-verde/40 bg-verde/10",
  ADVERTENCIA: "border-amarillo/60 bg-amarillo/15",
  ERROR: "border-destructive/30 bg-destructive/10 text-destructive",
};

// Sí/No, fechas como día-mes-año y el rol con su nombre.
function mostrar(campo: string, valor: string | boolean | null | undefined) {
  if (valor === true) return "Sí";
  if (valor === false) return "No";
  if (valor === null || valor === undefined || valor === "") return null;
  if (campo.startsWith("fecha_")) return valor.split("-").reverse().join("-");
  return campo === "rol" ? (NOMBRE_ROL[valor] ?? valor) : valor;
}

export function VistaPrevia({
  importacion,
}: {
  importacion: DetalleImportacion;
}) {
  const { id, pagina, resumen, muestra } = importacion;
  const revisada = importacion.estado !== "CARGADO";
  // Después de revisar, las columnas son los campos relacionados, en el
  // orden de la plantilla; antes, las columnas del archivo.
  const relacionados = new Set(Object.values(importacion.mapeo));
  const campos = importacion.campos.filter((c) => relacionados.has(c.clave));
  const tituloDe = (clave: string | null) =>
    importacion.campos.find((c) => c.clave === clave)?.titulo ?? "Fila";

  function enlace(estado: EstadoFila | null, numero: number) {
    const consulta = new URLSearchParams();
    if (estado) consulta.set("estado", estado);
    if (numero > 1) consulta.set("pagina", String(numero));
    const texto = consulta.toString();
    return `/admin/importaciones/${id}${texto ? `?${texto}` : ""}`;
  }

  const total = Object.values(resumen).reduce((suma, n) => suma + n, 0);
  const desde = (pagina.numero - 1) * POR_PAGINA + 1;
  const hasta = desde + muestra.length - 1;

  return (
    <>
      {revisada && (
        <nav
          aria-label="Filtrar filas por estado"
          className="mb-4 flex flex-wrap gap-2"
        >
          {FILTROS.map(({ estado, nombre }) => {
            const actual = pagina.estado === estado;
            return (
              <Link
                key={nombre}
                href={enlace(estado, 1)}
                aria-current={actual ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  actual
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card hover:bg-muted"
                }`}
              >
                {nombre}{" "}
                <span className="tabular-nums">
                  ({(estado ? resumen[estado] : total).toLocaleString("es-CL")})
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {muestra.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No hay filas con ese estado.
        </p>
      ) : (
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
                {revisada && (
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Estado
                  </th>
                )}
                {(revisada
                  ? campos.map((c) => c.titulo)
                  : importacion.columnas
                ).map((titulo) => (
                  <th
                    key={titulo}
                    scope="col"
                    className="px-4 py-3 font-semibold whitespace-nowrap"
                  >
                    {titulo}
                  </th>
                ))}
                {revisada && (
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Problemas
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {muestra.map((fila) => (
                <tr key={fila.numero_fila} className="align-top">
                  <th
                    scope="row"
                    className="px-4 py-3 font-normal tabular-nums text-muted-foreground"
                  >
                    {fila.numero_fila}
                  </th>
                  {revisada && (
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                          ESTILO_ESTADO[fila.estado] ??
                          "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {NOMBRE_ESTADO_FILA[fila.estado] ?? fila.estado}
                      </span>
                    </td>
                  )}
                  {revisada
                    ? campos.map((campo) => (
                        <td key={campo.clave} className="px-4 py-3">
                          {mostrar(
                            campo.clave,
                            fila.datos_normalizados?.[campo.clave],
                          ) ?? <span className="text-muted-foreground">—</span>}
                        </td>
                      ))
                    : importacion.columnas.map((columna) => (
                        <td
                          key={columna}
                          className="px-4 py-3 whitespace-pre-line"
                        >
                          {fila.datos_originales[columna] || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ))}
                  {revisada && (
                    <td className="min-w-72 px-4 py-3">
                      {fila.problemas && fila.problemas.length > 0 ? (
                        <ul className="space-y-1">
                          {fila.problemas.map((problema) => (
                            <li
                              key={`${problema.nivel}-${problema.campo}`}
                              className={
                                problema.nivel === "ERROR"
                                  ? "text-destructive"
                                  : undefined
                              }
                            >
                              <span className="sr-only">
                                {problema.nivel === "ERROR"
                                  ? "Error: "
                                  : "Advertencia: "}
                              </span>
                              <span className="font-medium">
                                {tituloDe(problema.campo)}:
                              </span>{" "}
                              {problema.mensaje}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {muestra.length > 0 && (
        <nav
          aria-label="Páginas de filas"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
        >
          <p>
            Filas {desde}–{hasta} de {pagina.filas.toLocaleString("es-CL")}. El
            número es la fila en el archivo.
          </p>
          {pagina.paginas > 1 && (
            <div className="flex gap-2">
              {pagina.numero > 1 && (
                <Link
                  href={enlace(pagina.estado, pagina.numero - 1)}
                  className={claseBotonSecundario}
                >
                  Anterior
                </Link>
              )}
              {pagina.numero < pagina.paginas && (
                <Link
                  href={enlace(pagina.estado, pagina.numero + 1)}
                  className={claseBotonSecundario}
                >
                  Siguiente
                </Link>
              )}
            </div>
          )}
        </nav>
      )}
    </>
  );
}