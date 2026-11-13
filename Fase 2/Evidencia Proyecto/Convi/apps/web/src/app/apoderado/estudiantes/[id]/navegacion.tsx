"use client";

import { useParams, usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Icono, type NombreIcono } from "@/app/components/icono";
import { MenuLateral, type EnlaceMenu } from "@/app/components/menu-lateral";

const SECCIONES: { parte: string; texto: string; icono: NombreIcono }[] = [
  { parte: "", texto: "Inicio", icono: "inicio" },
  { parte: "estudiante", texto: "Mi estudiante", icono: "persona" },
  { parte: "historial", texto: "Historial de convivencia", icono: "historial" },
  { parte: "situaciones", texto: "Situaciones", icono: "bandera" },
  { parte: "casos", texto: "Casos", icono: "carpeta" },
  { parte: "documentos", texto: "Documentos y actas", icono: "documentos" },
  { parte: "reuniones", texto: "Reuniones", icono: "anios" },
  { parte: "comunicaciones", texto: "Comunicaciones", icono: "mensaje" },
  { parte: "acceso", texto: "Mi acceso", icono: "candado" },
];

/**
 * Menú del pupilo. En el computador es el menú lateral de siempre, con su
 * resaltado que se desliza (components/menu-lateral.tsx). En el celular son
 * pestañas en una fila que se desliza de lado, y la pestaña elegida queda a la
 * vista sin mover la página hacia arriba o hacia abajo.
 */
export function Navegacion() {
  const { id } = useParams<{ id: string }>();
  const ruta = usePathname();
  const base = `/apoderado/estudiantes/${id}`;
  const enlaces: EnlaceMenu[] = SECCIONES.map((s) => ({ href: s.parte ? `${base}/${s.parte}` : base, texto: s.texto, icono: s.icono }));
  const activo = enlaces.findIndex((e) => (e.href === base ? ruta === base : ruta === e.href || ruta.startsWith(`${e.href}/`)));
  const fila = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const nav = fila.current;
    const pestana = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !pestana) return;
    nav.scrollLeft = pestana.offsetLeft - (nav.clientWidth - pestana.offsetWidth) / 2;
  }, [activo]);

  return <>
    <nav ref={fila} aria-label="Secciones del pupilo" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:hidden [&::-webkit-scrollbar]:hidden">
      {enlaces.map((e, i) => <Link key={e.href} href={e.href} prefetch={false} aria-current={i === activo ? "page" : undefined} className={`presion inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${i === activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
        <Icono nombre={e.icono} className="size-4 shrink-0" />{e.texto}
      </Link>)}
    </nav>
    <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-tarjeta lg:block">
      <MenuLateral etiqueta="Secciones del pupilo" raiz={base} secciones={[{ enlaces }]} />
    </div>
  </>;
}
