import type { ReactNode } from "react";
import { TransicionPagina } from "@/app/components/transicion-pagina";

// Al cambiar de pantalla dentro del portal del pupilo, solo el contenido sale y
// entra (components/transicion-pagina.tsx), la ficha y el menú quedan quietos.
export default function Template({ children }: { children: ReactNode }) {
  return <TransicionPagina>{children}</TransicionPagina>;
}
