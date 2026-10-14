import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MarcaCompacta } from "@/app/components/marca";
import { BotonCerrarSesion } from "@/app/components/boton-cerrar-sesion";
import { Navegacion } from "./navegacion";

// Portal del perfil CONVIVENCIA (PB-044). El proxy de PB-009 exige sesión,
// perfil y segundo factor antes de entrar, y cada página pide sus datos a la
// API, que vuelve a comprobar la cuenta en cada petición (PB-127).
export default function LayoutConvivencia({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="border-b border-border bg-card lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Link
            href="/convivencia"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          >
            <MarcaCompacta />
          </Link>
          <span className="rounded bg-accent px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-accent-foreground">
            Convivencia
          </span>
        </div>

        {/* Con cacheComponents, usePathname necesita un Suspense cuando la ruta
            tiene partes dinámicas, como /convivencia/situaciones/[id]. */}
        <Suspense
          fallback={
            <div
              aria-hidden="true"
              className="mx-3 my-3 h-9 animate-pulse rounded-lg bg-muted"
            />
          }
        >
          <Navegacion />
        </Suspense>
        <div className="border-t border-border px-4 py-3">
          <BotonCerrarSesion />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        {children}
      </main>
    </div>
  );
}
