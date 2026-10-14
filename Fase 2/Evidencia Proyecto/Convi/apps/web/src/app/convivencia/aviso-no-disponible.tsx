import Link from "next/link";
import { claseEnlace } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";

// La API respondió que lo pedido no existe, no es de esta escuela o que la
// cuenta ya no puede consultarlo. Se muestra lo mismo en todos los casos.
export function AvisoNoDisponible({ volverA }: { volverA: string }) {
  return (
    <div
      role="alert"
      className="mx-auto mt-8 max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-tarjeta"
    >
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icono nombre="candado" className="size-6" />
      </span>
      <h2 className="mt-4 text-xl font-semibold">No está disponible</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Lo que buscas no existe o tu cuenta no puede consultarlo en este momento.
      </p>
      <Link href={volverA} className={`mt-6 inline-block text-sm ${claseEnlace}`}>
        Volver
      </Link>
    </div>
  );
}
