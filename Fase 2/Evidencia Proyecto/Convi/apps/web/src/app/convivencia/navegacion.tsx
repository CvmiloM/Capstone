"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono, type NombreIcono } from "@/app/components/icono";

const ENLACES: { href: string; texto: string; icono: NombreIcono }[] = [
  // La bandeja incluye el detalle de cada situación (/convivencia/situaciones/...)
  { href: "/convivencia", texto: "Bandeja de situaciones", icono: "documentos" },
  // PB-043: situaciones que llegan por otros canales
  { href: "/convivencia/registrar", texto: "Registrar situación", icono: "info" },
    // PB-030 (Camilo): catálogo de categorías, el mismo del portal de administración
  { href: "/convivencia/categorias", texto: "Categorías", icono: "categorias" },
];

function estaActivo(ruta: string, href: string) {
  if (href === "/convivencia") {
    return ruta === href || ruta.startsWith("/convivencia/situaciones/");
  }
  return ruta === href || ruta.startsWith(`${href}/`);
}

export function Navegacion() {
  const ruta = usePathname();

  return (
    <nav aria-label="Secciones de Convivencia" className="px-3 pb-3 lg:py-4">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
        {ENLACES.map(({ href, texto, icono }) => {
          const activo = estaActivo(ruta, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activo ? "page" : undefined}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                  activo
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icono nombre={icono} className="size-4 shrink-0" />
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
