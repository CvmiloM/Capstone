import type { ReactNode } from "react";

// Íconos de línea de 24×24 con el mismo trazo que el resto de CONVI.
// Se usan por nombre: <Icono nombre="cursos" className="size-4" />.
// Para agregar uno, se suma su dibujo (los <path> del SVG) a TRAZOS.
const TRAZOS = {
    resumen: (
        <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
        </>
    ),
    establecimiento: (
        <path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M2 8l10-5 10 5v2H2z" />
    ),
    anios: (
        <>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18M8 14h2M14 18h2" />
        </>
    ),
    niveles: (
        <>
            <rect x="9" y="2" width="6" height="5" rx="1" />
            <rect x="2" y="17" width="6" height="5" rx="1" />
            <rect x="16" y="17" width="6" height="5" rx="1" />
            <path d="M12 7v5M5 17v-3h14v3" />
        </>
    ),
    cursos: (
        <>
            <path d="M2 3h20" />
            <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
            <path d="m7 21 5-5 5 5" />
        </>
    ),
    estudiantes: (
        <>
            <path d="M22 10 12 5 2 10l10 5 10-5z" />
            <path d="M6 12v5c3 2 9 2 12 0v-5" />
        </>
    ),
    usuarios: (
        <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
    ),
    apoderados: (
        <>
            <path d="M2.6 13.4a5.5 5.5 0 1 1 7.8-7.8 5.5 5.5 0 0 1-1.4 8.8L7 21H3v-4z" />
            <circle cx="16.5" cy="7.5" r="1" />
        </>
    ),
    importaciones: (
        <>
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
            <path d="M14 2v5h6M8 13h8M8 17h8M12 13v4" />
        </>
    ),
    categorias: (
        <>
            <path d="M9 5H4a2 2 0 0 0-2 2v5l8.5 8.5a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8L9 5z" />
            <circle cx="6.5" cy="9.5" r="1" />
            <path d="M14 5h4a2 2 0 0 1 2 2v4" />
        </>
    ),
    reglas: (
        <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    ),
    protocolos: (
        <path d="M3 5h1l1 1 2-2M3 12h1l1 1 2-2M3 19h1l1 1 2-2M11 6h10M11 13h10M11 20h10" />
    ),
    documentos: (
        <>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </>
    ),
    auditoria: (
        <>
            <path d="M3 3v5h5" />
            <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
            <path d="M12 7v5l4 2" />
        </>
    ),
    escudo: (
        <>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
        </>
    ),
    candado: (
        <>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
    ),
    info: (
        <>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
        </>
    ),
    alerta: (
        <>
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <path d="M12 9v4M12 17h.01" />
        </>
    ),
} satisfies Record<string, ReactNode>;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({
    nombre,
    className = "size-4",
}: {
    nombre: NombreIcono;
    className?: string;
}) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {TRAZOS[nombre]}
        </svg>
    );
}