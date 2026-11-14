import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Suspense, type ReactNode } from "react";
import { MarcaCompacta } from "@/app/components/marca";
import { BotonCerrarSesion } from "@/app/components/boton-cerrar-sesion";
import { EsqueletoUsuarioPortal, FichaEscuelaPortal, UsuarioPortal } from "@/app/components/usuario-portal";
import { SaltarContenido } from "@/app/components/saltar-contenido";

// Portal del apoderado (PB-113), solo de consulta. Arriba una barra fija con la
// marca y la cuenta, y debajo cada pantalla. También se diseña para el celular,
// porque los apoderados suelen entrar desde el teléfono.
export default function LayoutApoderado({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col">
    <SaltarContenido />
    <header className="sticky top-0 z-30 border-b border-border material-menu">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <Link href="/apoderado" prefetch={false} className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
          <MarcaCompacta />
          <span className="hidden text-sm text-muted-foreground md:inline"><span aria-hidden="true">· </span>Portal de Apoderados</span>
          <span className="sr-only">, inicio</span>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <Suspense fallback={<EsqueletoUsuarioPortal compacto />}><UsuarioPortal compacto /></Suspense>
          <BotonCerrarSesion />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-1 pb-2 sm:px-5">
        <Suspense fallback={null}><FichaEscuelaPortal familia /></Suspense>
      </div>
    </header>
    <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none sm:px-8 sm:py-8">{children}</main>
  </div>;
}
