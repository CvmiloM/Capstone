import { MenuLateral, type SeccionMenu } from "@/app/components/menu-lateral";

// Secciones del portal. El comentario de cada enlace indica las tablas del
// modelo de datos que administra esa pantalla.
const SECCIONES: SeccionMenu[] = [
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
export function Navegacion() {
    return (
        <MenuLateral
            etiqueta="Secciones de administración"
            raiz="/admin"
            secciones={SECCIONES}
        />
    );
}