"use client";

import { useActionState } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { ConfirmarEnvio } from "@/app/components/confirmar-envio";
import { desactivarEstudiantes } from "./acciones";

export function DesactivacionEstudiantes({
  buscar,
  curso,
  total,
  hoy,
}: {
  buscar: string;
  curso: string;
  total: number;
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(desactivarEstudiantes, {});
  if (total < 1 || total > 10000) return null;
  return (
    <details className="mb-5 rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer rounded-lg text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring">
        Desactivar estudiantes de esta búsqueda
      </summary>
      <div className="mt-4 max-w-xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Se desactivarán los {total} estudiantes activos que coinciden con los
          filtros, incluidas todas las páginas, se finalizarán sus matrículas
          vigentes y se conservarán sus antecedentes
        </p>
        <ConfirmarEnvio
          mensaje={`¿Desactivar ${total} estudiantes? Se aplicará a todos los que coinciden con esta búsqueda, no solo a la página visible, sus fichas y antecedentes se conservarán`}
        >
          <form action={accion} className="space-y-4">
            <input type="hidden" name="buscar" value={buscar} />
            <input type="hidden" name="curso" value={curso} />
            <input type="hidden" name="total_esperado" value={total} />
            {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
            <Campo
              name="fecha"
              etiqueta="Último día de matrícula"
              type="date"
              max={hoy}
              defaultValue={hoy}
              required
            />
            <Campo
              name="motivo"
              etiqueta="Motivo de la desactivación"
              minLength={5}
              maxLength={500}
              required
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                name="confirmado"
                type="checkbox"
                required
                className="mt-1 accent-primary"
              />
              Confirmo que revisé los filtros y quiero desactivar los {total}{" "}
              estudiantes
            </label>
            <BotonEnviar pendiente={pendiente} textoPendiente="Desactivando…">
              Desactivar {total} estudiantes
            </BotonEnviar>
          </form>
        </ConfirmarEnvio>
      </div>
    </details>
  );
}
