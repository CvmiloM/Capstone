import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import logo from "@/assets/convi-logo-trim.png";
import { BotonCerrarSesion } from "@/app/components/boton-cerrar-sesion";
import { obtenerContextoAdmin } from "./datos";
import { Navegacion } from "./navegacion";

// Portal del perfil ADMIN. En pantallas grandes el menú queda fijo a la
// izquierda; en pantallas chicas pasa a una franja de enlaces sobre el contenido.
export default function LayoutAdmin({ children }: LayoutProps<"/admin">) {
    // PB-009 comprueba el acceso en proxy y al leer datos del portal.
    return (
        <div className="flex flex-1 flex-col lg:flex-row">
            <aside className="border-b border-border bg-card lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
                <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                    <Link
                        href="/admin"
                        className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
                    >
                        {/* La imagen trae margen transparente: los márgenes negativos lo recortan. */}
                        <Image
                            src={logo}
                            alt="Convi, ir al inicio del portal"
                            priority
                            className="-my-3 -ml-2 block h-14 w-auto"
                        />
                    </Link>
                    <span className="translate-y-2.5 rounded bg-accent px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-accent-foreground">
                        Admin
                    </span>
                </div>

                <Suspense fallback={<Esqueleto className="mx-3 h-[4.75rem]" />}>
                    <FichaEscuela />
                </Suspense>

                {/* Con cacheComponents, usePathname necesita un Suspense cuando la ruta
            tiene partes dinámicas, como /admin/estudiantes/[id]. */}
                <Suspense fallback={<Esqueleto className="mx-3 my-3 h-9 lg:h-96" />}>
                    <Navegacion />
                </Suspense>
                <div className="border-t border-border px-4 py-3">
                    <BotonCerrarSesion />
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-16 items-center justify-end border-b border-border bg-card px-4 sm:px-8">
                    <Suspense fallback={<Esqueleto className="h-8 w-44" />}>
                        <UsuarioSesion />
                    </Suspense>
                </header>
                <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
            </div>
        </div>
    );
}

async function FichaEscuela() {
    const { escuela, anioActivo } = await obtenerContextoAdmin();
    const detalle = [escuela.codigo && `Código ${escuela.codigo}`, escuela.comuna]
        .filter(Boolean)
        .join(" · ");

    return (
        <div className="mx-3 rounded-xl border border-border px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{escuela.nombre}</p>
            {detalle && <p className="truncate text-xs text-muted-foreground">{detalle}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${anioActivo ? "bg-primary" : "bg-input"}`}
                />
                {anioActivo ? `Año académico ${anioActivo.anio}` : "Sin año académico activo"}
            </p>
        </div>
    );
}

async function UsuarioSesion() {
    const { usuario } = await obtenerContextoAdmin();
    const iniciales = `${usuario.nombres.charAt(0)}${usuario.apellidos.charAt(0)}`;

    return (
        <div className="flex items-center gap-2.5">
            <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
                {iniciales}
            </span>
            <div className="leading-tight">
                <p className="text-sm font-medium">
                    {usuario.nombres} {usuario.apellidos}
                </p>
                <p className="text-xs text-muted-foreground">Administrador</p>
            </div>
        </div>
    );
}

function Esqueleto({ className }: { className: string }) {
    return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}
