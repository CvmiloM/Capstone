import { claseEnlace } from "@/app/components/formulario";
// Mismo formato de fecha que el resto de los portales.
import { obtenerFormatoFecha } from "@/app/profesor/datos";
import {
  formatearTamano,
  NOMBRE_TIPO_EVIDENCIA,
  type Evidencia,
} from "./opciones";

// PB-066 (HU-057): evidencias ya adjuntadas, con su descarga. El enlace va a
// una ruta del portal (rutaDescarga/id) que pide el archivo a la API, donde
// se vuelve a comprobar el permiso (CA3).
export async function ListaEvidencias({
  evidencias,
  rutaDescarga,
  vacio,
}: {
  evidencias: Evidencia[];
  rutaDescarga: string;
  vacio: string;
}) {
  if (evidencias.length === 0)
    return <p className="text-sm text-muted-foreground">{vacio}</p>;
  const formatearFecha = await obtenerFormatoFecha();
  return (
    <ul className="divide-y divide-border text-sm">
      {evidencias.map((ev) => (
        <li
          key={ev.id}
          className="flex flex-wrap items-start justify-between gap-2 py-2.5"
        >
          <div className="min-w-0">
            <p className="font-medium">
              {ev.titulo}
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                {NOMBRE_TIPO_EVIDENCIA[ev.tipo] ?? ev.tipo}
              </span>
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
          </div>
          {ev.archivo && (
            <a
              href={`${rutaDescarga}/${ev.id}`}
              className={`shrink-0 ${claseEnlace}`}
            >
              Descargar
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
