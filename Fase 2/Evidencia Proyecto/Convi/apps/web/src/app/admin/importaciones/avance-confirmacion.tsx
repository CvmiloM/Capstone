"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { AvisoError, claseBotonPrimario } from "@/app/components/formulario";
import { type EstadoFormulario, reanudarConfirmacion } from "./acciones";
import type { AvanceImportacion, EstadoConfirmacion } from "./datos";
import { filas, type TipoImportacion } from "./opciones";

const estadoInicial: EstadoFormulario = {};
// Cada cuánto se pide el avance mientras la importación está Procesando.
const CADA_MILISEGUNDOS = 2000;

// PB-027 (HU-020 CA5): mientras la cola confirma, muestra cuántas filas lleva
// y lo pide de nuevo cada 2 segundos. Al terminar, recarga la página con el
// resultado. Si la confirmación se detuvo, ofrece reanudarla.
export function AvanceConfirmacion({
  id,
  tipo,
  inicial,
}: {
  id: string;
  tipo: TipoImportacion;
  inicial: EstadoConfirmacion;
}) {
  const router = useRouter();
  const [avance, setAvance] = useState(inicial);
  const [reanudacion, reanudar, reanudando] = useActionState(
    reanudarConfirmacion.bind(null, id),
    estadoInicial,
  );

  useEffect(() => {
    let vigente = true;
    let terminada = false;
    let consultando = false;
    const consultar = async () => {
      if (terminada || consultando) return;
      consultando = true;
      try {
        const respuesta = await fetch(
          `/admin/importaciones/${encodeURIComponent(id)}/avance`,
          { cache: "no-store" },
        );
        if (!vigente) return;
        // Sin sesión o con otro error, la página dice qué pasa.
        if (!respuesta.ok) {
          terminada = true;
          router.refresh();
          return;
        }
        const datos = (await respuesta.json()) as AvanceImportacion;
        if (!vigente) return;
        if (datos.estado !== "PROCESANDO") {
          terminada = true;
          router.refresh();
          return;
        }
        if (datos.confirmacion) setAvance(datos.confirmacion);
      } catch {
        // Sin conexión: se intenta de nuevo en la próxima vuelta.
      } finally {
        consultando = false;
      }
    };
    const intervalo = setInterval(consultar, CADA_MILISEGUNDOS);
    return () => {
      vigente = false;
      clearInterval(intervalo);
    };
  }, [id, router]);

  const porcentaje =
    avance.total > 0
      ? Math.min(100, Math.round((avance.procesadas / avance.total) * 100))
      : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">
          {filas(avance.procesadas)} de {avance.total.toLocaleString("es-CL")}{" "}
          procesadas ({porcentaje} %)
        </p>
        <div
          role="progressbar"
          aria-label="Avance de la confirmación"
          aria-valuemin={0}
          aria-valuemax={avance.total}
          aria-valuenow={avance.procesadas}
          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Las filas se confirman por tramos en segundo plano: puedes salir de esta
        página y la confirmación sigue. Estar en espera no significa que los
        datos ya estén guardados; las filas Confirmadas sí lo están.
        {tipo === "PROFESORES" &&
          " Cada profesor nuevo recibe su invitación cuando se confirma su fila."}
      </p>

      {!avance.en_curso && (
        <form
          action={reanudar}
          className="space-y-3 rounded-lg border border-amarillo/60 bg-amarillo/15 px-4 py-3"
        >
          <p className="text-sm">
            La confirmación se detuvo, por ejemplo porque la API se reinició.
            Reanúdala: sigue desde la fila donde quedó, sin repetir las ya
            confirmadas.
          </p>
          {reanudacion.mensaje && (
            <AvisoError>{reanudacion.mensaje}</AvisoError>
          )}
          <button
            type="submit"
            disabled={reanudando}
            className={claseBotonPrimario}
          >
            {reanudando ? "Reanudando…" : "Reanudar la confirmación"}
          </button>
        </form>
      )}
    </div>
  );
}
