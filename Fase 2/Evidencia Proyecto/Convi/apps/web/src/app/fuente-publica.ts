import { Figtree } from "next/font/google";

// Figtree es la letra del texto en toda la app (layout raíz), la portada y
// las pantallas de acceso.
export const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});
