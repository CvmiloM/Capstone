import { MenuLateral, type SeccionMenu } from "@/app/components/menu-lateral";

const SECCIONES: SeccionMenu[] = [
  {
    enlaces: [
      // La bandeja incluye el detalle de cada situación (/convivencia/situaciones/...)
      {
        href: "/convivencia",
        texto: "Bandeja de situaciones",
        icono: "documentos",
        tambien: ["/convivencia/situaciones"],
      },
      // PB-053: casos abiertos desde una situación (/convivencia/casos/...)
      {
        href: "/convivencia/casos",
        texto: "Casos",
        icono: "escudo",
      },

      { href: "/convivencia/seguimientos", texto: "Agenda de seguimientos", icono: "anios" },
      { href: "/convivencia/indicadores", texto: "Indicadores", icono: "categorias" },
      // PB-093 (HU-080): alertas del motor de reglas (/convivencia/alertas/...)
      { href: "/convivencia/alertas", texto: "Alertas", icono: "alerta" },
      // PB-095 (HU-082): avisos propios de cada profesional de Convivencia
      { href: "/convivencia/avisos", texto: "Avisos", icono: "info" },

      // PB-077 (Camilo): situaciones y casos por código, estudiante, estado y período
      {
        href: "/convivencia/expedientes",
        texto: "Buscar expedientes",
        icono: "buscar",
      },
      
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
      // PB-043: situaciones que llegan por otros canales
      {
        href: "/convivencia/documentos",
        texto: "Documentos institucionales",
        icono: "documentos",
      },
      {
        href: "/convivencia/registrar",
        texto: "Registrar situación",
        icono: "info",
      },
            // PB-075 (Camilo): situaciones de años anteriores
      {
        href: "/convivencia/historico",
        texto: "Registro histórico",
        icono: "anios",
      },
      // PB-074 (Camilo): historial de cada estudiante (/convivencia/estudiantes/...)
      {
        href: "/convivencia/estudiantes",
        texto: "Historial de estudiantes",
        icono: "estudiantes",
      },
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
