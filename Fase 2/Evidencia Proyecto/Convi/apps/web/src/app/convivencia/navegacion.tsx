import { MenuLateral, type SeccionMenu } from "@/app/components/menu-lateral";

// Menú de Convivencia en cuatro grupos. Lo que ya tiene otro acceso no se
// repite aquí: los avisos se abren con la campana (PB-095), Registrar
// situación es un botón de la bandeja (PB-043) y las pantallas que comparten
// una entrada se cambian con pestañas (pestanas-grupo.tsx). Todas conservan su
// dirección, y "tambien" deja marcada la entrada que las agrupa.
const SECCIONES: SeccionMenu[] = [
  {
    titulo: "Día a día",
    enlaces: [
      // La bandeja incluye el detalle de cada situación y el registro por otros canales
      {
        href: "/convivencia",
        texto: "Bandeja de situaciones",
        icono: "documentos",
        tambien: ["/convivencia/situaciones", "/convivencia/registrar"],
      },
      // PB-053: casos abiertos desde una situación (/convivencia/casos/...)
      { href: "/convivencia/casos", texto: "Casos", icono: "escudo" },
      {
        href: "/convivencia/plan-gestion",
        texto: "Plan de Gestión",
        icono: "documentos",
      },
      // PB-085 (HU-074): calendario, con la agenda de seguimientos en otra pestaña
      {
        href: "/convivencia/calendario",
        texto: "Calendario",
        icono: "anios",
        tambien: ["/convivencia/seguimientos"],
      },
      // PB-093 (HU-080): alertas del motor de reglas (/convivencia/alertas/...)
      { href: "/convivencia/alertas", texto: "Alertas", icono: "alerta" },
    ],
  },
  {
    titulo: "Consultas",
    enlaces: [
      // PB-077, PB-074 y PB-075: búsqueda, historial de estudiantes y registro histórico
      {
        href: "/convivencia/expedientes",
        texto: "Expedientes",
        icono: "buscar",
        tambien: ["/convivencia/estudiantes", "/convivencia/historico"],
      },
      {
        href: "/convivencia/indicadores",
        texto: "Indicadores e informes",
        icono: "categorias",
        tambien: ["/convivencia/informes"],
      },
    ],
  },
  {
    titulo: "Normativa",
    enlaces: [
      // PB-081 y PB-083: protocolos de la escuela, que se aplican en los casos (PB-082)
      {
        href: "/convivencia/protocolos",
        texto: "Protocolos",
        icono: "protocolos",
      },
      // PB-117 a PB-119 (Camilo): consulta del reglamento con IA, solo para Convivencia
      {
        href: "/convivencia/reglamento",
        texto: "Consultar reglamento",
        icono: "buscar",
      },
      {
        href: "/convivencia/documentos",
        texto: "Documentos institucionales",
        icono: "documentos",
      },
    ],
  },
  {
    titulo: "Configuración",
    enlaces: [
      // PB-030 (Camilo): catálogo de categorías, el mismo del portal de administración
      {
        href: "/convivencia/categorias",
        texto: "Categorías",
        icono: "categorias",
      },
      // PB-089 (Camilo): reglas de aviso, las mismas del portal de administración
      {
        href: "/convivencia/reglas",
        texto: "Reglas de aviso",
        icono: "reglas",
      },
    ],
  },
];

export function Navegacion() {
  return (
    <MenuLateral
      etiqueta="Secciones de Convivencia"
      raiz="/convivencia"
      secciones={SECCIONES}
    />
  );
}
