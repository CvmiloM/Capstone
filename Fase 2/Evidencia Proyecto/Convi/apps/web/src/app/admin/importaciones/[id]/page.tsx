import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { obtenerContextoAdmin } from "../../datos";
import { obtenerImportacion } from "../datos";
import { FormularioRevision } from "../formulario-revision";
import {
  type EstadoFila,
  NOMBRE_ESTADO,
  NOMBRE_ESTADO_FILA,
  NOMBRE_TIPO,
} from "../opciones";
import { VistaPrevia } from "./vista-previa";

export const metadata: Metadata = { title: "Importación" };

function tamano(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("es-CL")} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MB`;
}

function leer(valor: string | undefined) {
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-019 y PB-020 (HU-015): la importación cargada. Primero se relaciona cada
// columna con un campo de CONVI (CA3); después, la vista previa muestra cada
// fila Válida, Con advertencia o Con error (CA4), filtrable por estado
// (?estado=ERROR&pagina=2). CA5: nada se guarda en las fichas.
export default async function PaginaImportacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estado?: string; pagina?: string }>;
}) {
  const [{ id }, parametros] = await Promise.all([params, searchParams]);
  const estado = leer(parametros.estado).toUpperCase();
  const filtro = {
    estado: Object.hasOwn(NOMBRE_ESTADO_FILA, estado)
      ? (estado as EstadoFila)
      : null,
    pagina: Math.max(1, Number.parseInt(leer(parametros.pagina), 10) || 1),
  };
  const [importacion, { escuela }] = await Promise.all([
    obtenerImportacion(id, filtro),
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
  const nombreEstado = NOMBRE_ESTADO[importacion.estado] ?? importacion.estado;
  const revisada = importacion.estado === "REVISION";
  // Solo se relacionan columnas antes de confirmar (la API también lo exige).
  const editable = ["CARGADO", "REVISION"].includes(importacion.estado);
  const primera = importacion.muestra[0];

  const formulario = editable && (
    <section
      aria-labelledby="titulo-columnas"
      className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
    >
      <h2 id="titulo-columnas" className="text-lg font-semibold">
        {revisada ? "Columnas y opciones" : "Relaciona las columnas"}
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        {revisada
          ? "Si algo no calza, cambia el campo de una columna o las opciones y vuelve a revisar las filas."
          : "Elige qué campo de CONVI trae cada columna. Ya vienen sugeridos según el título; las que no se relacionen no se importan."}
      </p>
      {/* Lo guardado cambia después de revisar: el formulario parte de nuevo
          con eso y no con lo que se envió en un intento con errores. */}
      <FormularioRevision
        key={JSON.stringify([importacion.mapeo, importacion.opciones])}
        importacion={{
          id: importacion.id,
          campos: importacion.campos,
          columnas: importacion.columnas,
          mapeo: importacion.mapeo,
          opciones: importacion.opciones,
          anios: importacion.anios,
          uso_del_anio: importacion.uso_del_anio,
        }}
        ejemplo={
          primera
            ? {
                numero_fila: primera.numero_fila,
                datos: primera.datos_originales,
              }
            : null
        }
      />
    </section>
  );

  return (
    <>
      <Link href="/admin/importaciones" className={`text-sm ${claseEnlace}`}>
        ← Importaciones
      </Link>

      <div className="mt-4">
        <Encabezado
          titulo={importacion.archivo_nombre}
          descripcion={`${tipo} · ${importacion.filas.toLocaleString("es-CL")} ${importacion.filas === 1 ? "fila" : "filas"} · ${tamano(importacion.archivo_bytes)} · ${nombreEstado} · Cargada por ${importacion.creado_por} el ${creado}`}
        />
      </div>

      <p
        role="note"
        className="mb-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
      >
        {revisada
          ? "Esta es la vista previa de la importación. Todavía no se guardó nada en las fichas: eso pasa solo al confirmar la importación."
          : "El archivo quedó guardado en el espacio privado de la escuela y sus filas se conservan tal como venían. Todavía no se guardó nada en las fichas."}
      </p>

      <div className="space-y-8">
        {!revisada && formulario}

        <section aria-labelledby="titulo-filas">
          <h2 id="titulo-filas" className="mb-3 text-lg font-semibold">
            {revisada ? "Vista previa" : "Filas del archivo"}
          </h2>
          <VistaPrevia importacion={importacion} />
        </section>

        {revisada && formulario}
      </div>
    </>
  );
}