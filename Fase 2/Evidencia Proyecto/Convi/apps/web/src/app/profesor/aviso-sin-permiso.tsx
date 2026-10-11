import Link from "next/link";
import { claseEnlace } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";

// HU-034 CA3: si el registro es de otra persona, de un curso sin asignación
// vigente o no existe, se muestra lo mismo, sin revelar nada de su contenido.
export function AvisoSinPermiso({ volverA }: { volverA: string }) {
  return (
    <div
      role="alert"
      className="mx-auto mt-8 max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-tarjeta"
    >
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icono nombre="candado" className="size-6" />
      </span>
      <h2 className="mt-4 text-xl font-semibold">No puedes ver este registro</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Solo puedes ver los cursos donde tienes una asignación vigente y las
        situaciones que tú registraste.
      </p>
      <Link href={volverA} className={`mt-6 inline-block text-sm ${claseEnlace}`}>
        Volver
      </Link>
    </div>
  );
}