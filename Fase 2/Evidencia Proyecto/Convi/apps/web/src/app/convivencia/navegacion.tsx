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
      // PB-043: situaciones que llegan por otros canales
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