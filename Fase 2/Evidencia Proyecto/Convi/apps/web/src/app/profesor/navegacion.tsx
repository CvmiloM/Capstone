import { MenuLateral, type SeccionMenu } from "@/app/components/menu-lateral";

const SECCIONES: SeccionMenu[] = [
  {
    enlaces: [
      // Mis cursos incluye las páginas de cada curso (/profesor/cursos/...)
      {
        href: "/profesor",
        texto: "Mis cursos",
        icono: "cursos",
        tambien: ["/profesor/cursos"],
      },
      {
        href: "/profesor/situaciones",
        texto: "Mis registros",
        icono: "documentos",
      },
    ],
  },
];

export function Navegacion() {
  return (
    <MenuLateral
      etiqueta="Secciones del profesor"
      raiz="/profesor"
      secciones={SECCIONES}
    />
  );
}