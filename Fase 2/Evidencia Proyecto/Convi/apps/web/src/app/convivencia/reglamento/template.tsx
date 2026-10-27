import type { ReactNode } from "react";
import { TransicionPagina } from "@/app/components/transicion-pagina";

// Al cambiar de pantalla dentro de esta carpeta, el contenido sale y entra
// con la transición de components/transicion-pagina.tsx.
export default function Template({ children }: { children: ReactNode }) {
  return <TransicionPagina>{children}</TransicionPagina>;
}
