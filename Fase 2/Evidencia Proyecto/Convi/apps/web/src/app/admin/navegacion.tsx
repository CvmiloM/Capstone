"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono, type NombreIcono } from "@/app/components/icono";

type Enlace = { href: string; texto: string; icono: NombreIcono };

// Secciones del portal. El comentario de cada enlace indica las tablas del
// modelo de datos que administra esa pantalla.
const SECCIONES: { titulo: string; enlaces: Enlace[] }[] = [
    {
        titulo: "General",
        enlaces: [{ href: "/admin", texto: "Resumen", icono: "resumen" }],
    },
    {
        titulo: "Institución",
        enlaces: [
            // establecimientos
            { href: "/admin/establecimiento", texto: "Establecimiento", icono: "establecimiento" },
            // anios_academicos
            { href: "/admin/anios", texto: "Años académicos", icono: "anios" },
            // niveles_educativos
            { href: "/admin/niveles", texto: "Niveles educativos", icono: "niveles" },
        ],
    },
    {
        titulo: "Comunidad escolar",
        enlaces: [
            // cursos, asignaciones_docentes
            { href: "/admin/cursos", texto: "Cursos", icono: "cursos" },
            // personas, estudiantes, matriculas
            { href: "/admin/estudiantes", texto: "Estudiantes", icono: "estudiantes" },
        ],
    },
    {
        titulo: "Personas y accesos",
        enlaces: [
            // personas, membresias_establecimiento
            { href: "/admin/usuarios", texto: "Usuarios", icono: "usuarios" },
            // apoderados_estudiante, accesos_apoderado
            { href: "/admin/apoderados", texto: "Apoderados", icono: "apoderados" },
        ],
    },
    {
        titulo: "Datos",
        enlaces: [
            // procesos_importacion, filas_importacion
            { href: "/admin/importaciones", texto: "Importaciones", icono: "importaciones" },
        ],
    },
    {
        titulo: "Configuración",
        enlaces: [
            // categorias_convivencia
            { href: "/admin/categorias", texto: "Categorías", icono: "categorias" },
            // reglas
            { href: "/admin/reglas", texto: "Reglas", icono: "reglas" },
            // protocolos, versiones_protocolo, pasos_protocolo
            { href: "/admin/protocolos", texto: "Protocolos", icono: "protocolos" },
            // documentos_institucionales, versiones_documento
            { href: "/admin/documentos", texto: "Documentos", icono: "documentos" },
        ],
    },
    {
        titulo: "Control",
        enlaces: [
            // eventos_auditoria
            { href: "/admin/auditoria", texto: "Auditoría", icono: "auditoria" },
        ],
    },
];

// El resumen (/admin) solo se marca en su propia página; las demás secciones
// también en sus subpáginas, por ejemplo /admin/estudiantes/123.
function estaActivo(ruta: string, href: string) {
    if (href === "/admin") return ruta === href;
    return ruta === href || ruta.startsWith(`${href}/`);
}

export function Navegacion() {
    const ruta = usePathname();

    return (
        <nav
            aria-label="Secciones de administración"
            className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-5 lg:overflow-visible lg:py-4"
        >
            {SECCIONES.map(({ titulo, enlaces }) => (
                <div key={titulo} className="flex lg:block">
                    <p className="hidden px-2.5 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:block">
                        {titulo}
                    </p>
                    <ul className="flex gap-1 lg:flex-col lg:gap-0.5">
                        {enlaces.map(({ href, texto, icono }) => {
                            const activo = estaActivo(ruta, href);
                            return (
                                <li key={href}>
                                    <Link
                                        href={href}
                                        aria-current={activo ? "page" : undefined}
                                        className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${activo
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
                </div>
            ))}
        </nav>
    );
}