import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Outfit,
  Source_Serif_4,
} from "next/font/google";
import "./globals.css";
import { Actividad } from "./components/actividad";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

// Fuente de los títulos (h1, h2), le da el tono institucional
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

// font-titulo también se usa en los portales.
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
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Actividad />
      </body>
    </html>
  );
}
