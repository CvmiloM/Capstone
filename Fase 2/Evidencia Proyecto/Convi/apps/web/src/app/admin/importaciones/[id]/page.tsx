import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { obtenerContextoAdmin } from "../../datos";
import { AccionesConfirmacion } from "../acciones-confirmacion";
import { BotonRevalidar, FormularioCancelacion } from "../acciones-importacion";
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

// PB-019, PB-020, PB-026 y PB-027 (HU-015 y HU-020): la importación cargada.
// Primero se relaciona cada columna con un campo de CONVI (CA3); después, la
// vista previa muestra cada fila Válida, Con advertencia o Con error (CA4),
// filtrable por estado (?estado=ERROR&pagina=2). Recién al confirmar se
// guardan en las fichas, en segundo plano y con su avance. PB-024 y PB-025
// (HU-019): se retoma una importación Cargada, En revisión o Fallida, se
// corrigen sus filas abiertas, y se cancela o restaura con un motivo.
export default async function PaginaImportacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    estado?: string;
    pagina?: string;
    aviso?: string;
    fila?: string;
  }>;
}) {
  const [{ id }, parametros] = await Promise.all([params, searchParams]);
  const estado = leer(parametros.estado).toUpperCase();
  const filtro = {
    estado: Object.hasOwn(NOMBRE_ESTADO_FILA, estado)
      ? (estado as EstadoFila)
      : null,
    pagina: Math.max(1, Number.parseInt(leer(parametros.pagina), 10) || 1),
  };
  const [importacion, { escuela, guia }] = await Promise.all([
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

  // Fechas con la zona horaria de la escuela.
  const fecha = (iso: string | null | undefined) =>
    iso
      ? new Intl.DateTimeFormat("es-CL", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: escuela.zonaHoraria,
        }).format(new Date(iso))
      : null;
  const creado = fecha(importacion.creado_en);
  const tipo =
    NOMBRE_TIPO[importacion.tipo_importacion] ?? importacion.tipo_importacion;
  const nombreEstado = NOMBRE_ESTADO[importacion.estado] ?? importacion.estado;
  const revisada = importacion.estado === "REVISION";
  const procesando = importacion.estado === "PROCESANDO";
  const confirmada = importacion.estado === "CONFIRMADO";
  const fallida = importacion.estado === "FALLIDO";
  const cancelada = importacion.estado === "CANCELADO";
  const conConfirmadas = importacion.resumen.CONFIRMADO > 0;
  // Solo se relacionan columnas antes de confirmar filas (la API también lo exige).
  const editable =
    ["CARGADO", "REVISION", "FALLIDO"].includes(importacion.estado) &&
    !conConfirmadas;
  // PB-024 (HU-019 CA1 a CA3): con las filas ya revisadas se corrigen y se
  // revisan de nuevo, aunque haya filas confirmadas.
  const puedeCorregir = revisada || fallida;
  // PB-025 (HU-019 CA4 y CA6): se cancela sin filas confirmadas y mientras
  // no se esté confirmando.
  const cancelable =
    ["CARGADO", "REVISION", "FALLIDO"].includes(importacion.estado) &&
    !conConfirmadas;
  const confirmadaEl = fecha(importacion.confirmado_en);
  const terminadaEl = fecha(importacion.confirmacion?.terminada_en);
  const primera = importacion.muestra[0];
  const fila = leer(parametros.fila);
  const aviso: Record<string, string> = {
    corregida: `Se guardó la corrección de la fila ${fila} y se revisaron de nuevo las filas abiertas.`,
    "sin-correccion": `La fila ${fila} volvió a los valores del archivo y se revisaron de nuevo las filas abiertas.`,
    cancelada:
      "La importación quedó Cancelada. El motivo quedó en la auditoría con tu nombre y la fecha.",
    restaurada:
      "La importación volvió a su estado anterior. El motivo quedó en la auditoría con tu nombre y la fecha.",
  };
  const mensajeAviso = Object.hasOwn(aviso, leer(parametros.aviso))
    ? aviso[leer(parametros.aviso)]
    : null;
  const { cancelacion } = importacion;
  const estadoAnterior = cancelacion
    ? (NOMBRE_ESTADO[cancelacion.estado_anterior] ??
      cancelacion.estado_anterior)
    : null;

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

      {/* PB-036 (HU-029): la nómina cargada desde la guía inicial. */}
      {importacion.tipo_importacion === "ESTUDIANTES" && !guia.terminada && (
        <p
          role="note"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/15 bg-accent px-4 py-3 text-sm text-accent-foreground"
        >
          <span>
            Tu escuela está en la guía inicial. Cuando confirmes la nómina,
            vuelve a la guía para terminar el paso Estudiantes.
          </span>
          <Link
            href="/admin/guia?paso=estudiantes"
            className={`font-medium ${claseEnlace}`}
          >
            Volver a la guía
          </Link>
        </p>
      )}

      {mensajeAviso && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-verde/40 bg-verde/10 px-4 py-3 text-sm"
        >
          {mensajeAviso}
        </p>
      )}

      <p
        role="note"
        className="mb-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
      >
        {cancelada
          ? "La importación está Cancelada: no se revisa, corrige ni confirma. El archivo y sus filas se conservan tal como estaban, y puedes restaurarla."
          : fallida
            ? "La importación quedó Fallida. Puedes retomarla: el archivo, el mapeo, las opciones y las correcciones se conservan. Revisa las filas de nuevo para seguir."
            : confirmada
              ? "La importación quedó Confirmada: sus filas confirmadas ya están en las fichas de la escuela."
              : procesando
                ? "La importación se está confirmando en segundo plano. Las filas Confirmadas ya están en las fichas de la escuela; las que esperan, todavía no."
                : revisada && conConfirmadas
                  ? "Las filas Confirmadas ya están en las fichas de la escuela. Las demás se pueden confirmar u omitir."
                  : revisada
                    ? "Esta es la vista previa de la importación. Todavía no se guardó nada en las fichas: eso pasa solo al confirmar la importación."
                    : "El archivo quedó guardado en el espacio privado de la escuela y sus filas se conservan tal como venían. Todavía no se guardó nada en las fichas."}
      </p>

      <div className="space-y-8">
        {cancelada && (
          <section
            aria-labelledby="titulo-cancelada"
            className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
          >
            <h2 id="titulo-cancelada" className="text-lg font-semibold">
              Importación cancelada
            </h2>
            {cancelacion ? (
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="font-medium">Cancelada por</dt>
                <dd className="text-muted-foreground">
                  {cancelacion.por}, el {fecha(cancelacion.en)}
                </dd>
                <dt className="font-medium">Motivo</dt>
                <dd className="whitespace-pre-line text-muted-foreground">
                  {cancelacion.motivo}
                </dd>
                <dt className="font-medium">Antes estaba</dt>
                <dd className="text-muted-foreground">{estadoAnterior}</dd>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No encontramos la cancelación en la auditoría, por eso no se
                puede restaurar.
              </p>
            )}
            {cancelacion && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  Al restaurarla vuelve a {estadoAnterior?.toLowerCase()}, con
                  su mapeo, sus opciones y sus correcciones.
                </p>
                <FormularioCancelacion
                  id={importacion.id}
                  accion="restaurar"
                  confirmacion={`¿Restaurar la importación? Vuelve a ${estadoAnterior?.toLowerCase()} y el motivo quedará en la auditoría.`}
                />
              </div>
            )}
          </section>
        )}

        {!revisada && formulario}

        {(revisada || procesando || confirmada) && (
          <section
            aria-labelledby="titulo-confirmar"
            className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
          >
            <h2 id="titulo-confirmar" className="mb-3 text-lg font-semibold">
              {confirmada
                ? "Importación confirmada"
                : procesando
                  ? "Confirmando la importación"
                  : "Confirmar la importación"}
            </h2>
            <AccionesConfirmacion
              id={importacion.id}
              tipo={importacion.tipo_importacion}
              estado={importacion.estado}
              resumen={importacion.resumen}
              confirmacion={importacion.confirmacion}
              confirmadaEl={confirmadaEl}
              terminadaEl={terminadaEl}
            />
          </section>
        )}

        <section aria-labelledby="titulo-filas">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="titulo-filas" className="text-lg font-semibold">
              {confirmada || procesando || cancelada
                ? "Filas de la importación"
                : revisada || fallida
                  ? "Vista previa"
                  : "Filas del archivo"}
            </h2>
            {puedeCorregir && <BotonRevalidar id={importacion.id} />}
          </div>
          {puedeCorregir && (
            <p className="mb-4 text-sm text-muted-foreground">
              Corrige una fila con su enlace Corregir: cambia solo sus datos
              normalizados y el archivo original no cambia. Al guardar, o con
              Volver a revisar las filas, cada fila abierta se revisa de nuevo
              con lo que hay hoy en la escuela.
            </p>
          )}
          <VistaPrevia
            importacion={importacion}
            puedeCorregir={puedeCorregir}
            fecha={fecha}
          />
        </section>

        {revisada && formulario}

        {cancelable && (
          <section
            aria-labelledby="titulo-cancelar"
            className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
          >
            <h2 id="titulo-cancelar" className="text-lg font-semibold">
              Cancelar la importación
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Si cargaste un archivo equivocado o ya no la vas a usar,
              cancélala. No se borra nada: el archivo y sus filas se conservan y
              puedes restaurarla después.
            </p>
            <FormularioCancelacion
              id={importacion.id}
              accion="cancelar"
              confirmacion="¿Cancelar la importación? No se podrá revisar, corregir ni confirmar hasta restaurarla, y el motivo quedará en la auditoría."
            />
          </section>
        )}
      </div>
    </>
  );
}