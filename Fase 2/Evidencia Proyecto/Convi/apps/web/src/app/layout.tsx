import type { Metadata } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { Actividad } from "./components/actividad";
import { figtree } from "./fuente-publica";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

// Fuente de los títulos (h1, h2) y de font-titulo en toda la app.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "CONVI", template: "%s · CONVI" },
  description: "Seguimiento y trazabilidad de la convivencia escolar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${figtree.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Actividad />
      </body>
    </html>
  );
}
