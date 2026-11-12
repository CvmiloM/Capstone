import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import mascota from "@/assets/convi-favicon.png";
import { EnlaceConCarga } from "@/app/components/actividad";
import "./acceso.css";
import { figtree } from "../fuente-publica";

// Las páginas de acceso continúan la landing: el mismo fondo, la misma barra y
// la misma pila de carpetas, con el formulario en la carpeta de adelante.
const CARPETAS = [
  { fondo: "var(--pizarra)", x: "4%", xTelefono: "4%" },
  { fondo: "var(--menta)", x: "25%", xTelefono: "34%" },
  { fondo: "var(--amarillo)", x: "47%", xTelefono: "62%" },
  { fondo: "var(--niebla)", x: "70%", xTelefono: "10%" },
];

const estiloCarpeta = (
  i: number,
  fondo: string,
  x: string,
  xTelefono: string,
) =>
  ({
    "--i": i,
    "--fondo": fondo,
    "--x": x,
    "--x-telefono": xTelefono,
  }) as CSSProperties;

export default function LayoutPublico({ children }: { children: ReactNode }) {
  return (
    <div className={`${figtree.variable} acc-pagina flex flex-1 flex-col font-cuerpo`}>
      <nav aria-label="Principal" className="acc-barra">
        <EnlaceConCarga href="/" aria-label="Convi, inicio" className="rounded-full">
          <Image src={mascota} alt="" priority sizes="48px" className="block size-12" />
        </EnlaceConCarga>
        <EnlaceConCarga
          href="/"
          className="acc-volver underline decoration-transparent underline-offset-4 transition-colors duration-200 hover:decoration-current"
        >
          Volver al inicio
        </EnlaceConCarga>
      </nav>
      <main className="flex flex-1 flex-col">
        <p className="acc-nombre">Convi</p>
        <div className="acc-carpetas">
          {CARPETAS.map(({ fondo, x, xTelefono }, i) => (
            <div
              key={fondo}
              aria-hidden="true"
              className="acc-carpeta"
              style={estiloCarpeta(i, fondo, x, xTelefono)}
            >
              <span className="acc-pestana" />
            </div>
          ))}
          <div
            className="acc-carpeta acc-frente"
            style={estiloCarpeta(CARPETAS.length, "var(--crema)", "8%", "58%")}
          >
            <span aria-hidden="true" className="acc-pestana">
              Acceso
            </span>
            <div className="acc-contenido">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
