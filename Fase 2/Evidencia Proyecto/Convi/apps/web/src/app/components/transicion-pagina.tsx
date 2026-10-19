import { ViewTransition, type ReactNode } from "react";

/**
 * Cambio de pantalla dentro de los portales (lo usan los template.tsx). Al
 * navegar, lo viejo sale y lo nuevo entra con las animaciones pagina-sale y
 * pagina-entra de globals.css, en la dirección que anotó el menú lateral.
 * Solo anima al cambiar de pantalla, no al enviar formularios ni al
 * refrescar datos (default="none").
 */
export function TransicionPagina({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="pagina-entra" exit="pagina-sale" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}