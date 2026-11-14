import { Icono } from "@/app/components/icono";
import { Fragment } from "react";
import { claseBotonSecundario, claseEnlace } from "@/app/components/formulario";
// Mismo formato de fecha que el resto de los portales.
import { obtenerFormatoFecha } from "@/app/profesor/datos";
import { FormularioEvidencia } from "./formulario-evidencia";
import {
  formatearTamano,
  NOMBRE_TIPO_EVIDENCIA,
  type Evidencia,
} from "./opciones";

// PB-066 (HU-057): evidencias ya adjuntadas, con su descarga. El enlace va a
// una ruta del portal (rutaDescarga/id) que pide el archivo a la API, donde
// se vuelve a comprobar el permiso (CA3). PB-073 (HU-063): cada corrección
// dice a cuál corrige y por qué, y la original sigue visible marcada como
// corregida.
export async function ListaEvidencias({
  evidencias,
  rutaDescarga,
  vacio,
  corregir,
  vistaImagen = false,
}: {
  evidencias: Evidencia[];
  rutaDescarga: string;
  vacio: string;
  vistaImagen?: boolean;
  /** PB-073: Convivencia corrige desde la situación o el caso abierto. */
  corregir?: {
    destino: "convivencia-correccion-situacion" | "convivencia-correccion-caso";
    registroId: string;
  };
}) {
  if (evidencias.length === 0)
    return <p className="text-sm text-muted-foreground">{vacio}</p>;
  const formatearFecha = await obtenerFormatoFecha();
  return (
    <ul className="divide-y divide-border text-sm">
      {evidencias.map((ev) => (
        <li
          key={ev.id}
          id={`evidencia-${ev.id}`}
          className="flex flex-wrap items-start justify-between gap-2 py-2.5"
        >
          <div className="min-w-0">
            <p className="font-medium">
              {ev.titulo}
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                {NOMBRE_TIPO_EVIDENCIA[ev.tipo] ?? ev.tipo}
              </span>
              {ev.corrige && (
                <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-normal text-accent-foreground">
                  Corrección
                </span>
              )}
              {ev.corregida_por && ev.corregida_por.length > 0 && (
                <span className="ml-2 rounded-full bg-amarillo/25 px-2 py-0.5 text-xs font-normal text-tinta">
                  Corregida
                </span>
              )}
            </p>
            {ev.descripcion && (
              <p className="mt-0.5 whitespace-pre-line text-muted-foreground">
                {ev.descripcion}
              </p>
            )}
            <p className="mt-0.5 break-all text-xs text-muted-foreground">
              {[
                ev.archivo,
                ev.tamano_bytes ? formatearTamano(ev.tamano_bytes) : null,
                ev.origen,
                ev.creado_por
                  ? `${ev.creado_por}, ${formatearFecha(ev.creado_en)}`
                  : formatearFecha(ev.creado_en),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {ev.corrige && (
              <p className="mt-1 text-xs">
                Corrige a{" "}
                <a href={`#evidencia-${ev.corrige.id}`} className={claseEnlace}>
                  «{ev.corrige.titulo}»
                </a>
                {ev.motivo_correccion && (
                  <span className="whitespace-pre-line">
                    {" "}
                    · Motivo: {ev.motivo_correccion}
                  </span>
                )}
              </p>
            )}
            {ev.corregida_por && ev.corregida_por.length > 0 && (
              <p className="mt-1 text-xs">
                Corregida por{" "}
                {ev.corregida_por.map((c, i) => (
                  <Fragment key={c.id}>
                    {i > 0 && ", "}
                    <a href={`#evidencia-${c.id}`} className={claseEnlace}>
                      «{c.titulo}»
                    </a>{" "}
                    el {formatearFecha(c.creado_en)}
                  </Fragment>
                ))}
              </p>
            )}
          </div>
          {vistaImagen && ev.archivo && /\.(?:jpe?g|png|webp)$/i.test(ev.archivo) && (
            <a href={`${rutaDescarga}/${ev.id}?vista=1`} className={`gap-2 ${claseBotonSecundario}`} target="_blank" rel="noopener">
              <Icono nombre="ojo" className="size-4 shrink-0" />
              Ver imagen
            </a>
          )}
          {ev.archivo && (
            <a
              href={`${rutaDescarga}/${ev.id}`}
              className={`shrink-0 ${claseEnlace}`}
            >
              <span className="inline-flex items-center gap-1.5"><Icono nombre="descargar" className="size-4 shrink-0" />Descargar</span>
            </a>
          )}
          {corregir && (
            <details className="basis-full rounded-xl bg-muted/50 p-3 open:bg-card">
              <summary className={`w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden gap-2 ${claseBotonSecundario}`}>
                <Icono nombre="editar" className="size-4 shrink-0" />
                Corregir esta evidencia
              </summary>
              <div className="pt-3">
                <FormularioEvidencia
                  destino={corregir.destino}
                  registroId={corregir.registroId}
                  corrige={{ id: ev.id, acta: ev.tipo === "ACTA" }}
                />
              </div>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
