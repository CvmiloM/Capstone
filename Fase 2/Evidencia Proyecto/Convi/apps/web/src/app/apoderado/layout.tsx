import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MarcaCompacta } from "@/app/components/marca";
import { BotonCerrarSesion } from "@/app/components/boton-cerrar-sesion";
import { EsqueletoUsuarioPortal, UsuarioPortal } from "@/app/components/usuario-portal";

export default function LayoutApoderado({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col">
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link href="/apoderado" prefetch={false} aria-label="CONVI, inicio del portal del apoderado" className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"><MarcaCompacta /></Link>
        <div className="flex min-w-0 items-center gap-4"><Suspense fallback={<EsqueletoUsuarioPortal compacto />}><UsuarioPortal compacto /></Suspense><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Apoderado</span><BotonCerrarSesion /></div>
      </div>
    </header>
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
  </div>;
}
