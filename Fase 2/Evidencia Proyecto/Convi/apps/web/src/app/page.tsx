import Link from "next/link";
import type { ReactNode } from "react";
import {
  claseBotonPrimario,
  claseBotonSecundario,
  claseEnlace,
} from "@/app/components/formulario";
import { MarcaCompacta } from "@/app/components/marca";

// Textos basados en la descripción del proyecto (README): eje reactivo,
// eje preventivo y separación por establecimiento.
const caracteristicas: { titulo: string; texto: string; icono: ReactNode }[] = [
  {
    titulo: "Situaciones y casos",
    texto:
      "Profesores y Convivencia registran lo que ocurre. Cada caso reúne entrevistas, acuerdos, seguimientos y las evidencias de cada paso.",
    icono: (
      <>
        <rect x="5.5" y="4" width="13" height="17" rx="2" />
        <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3.5" />
      </>
    ),
  },
  {
    titulo: "Plan de Gestión",
    texto:
      "El eje preventivo: el Plan de Gestión de Convivencia del establecimiento, ordenado en objetivos, acciones y actividades.",
    icono: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    titulo: "Cada escuela, sus datos",
    texto:
      "Cada establecimiento mantiene separados sus usuarios, estudiantes y registros, y cada perfil ve solo lo que le corresponde.",
    icono: <path d="M12 3 19 6v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />,
  },
];

export default function PaginaInicio() {
  return (
    <div className="relative isolate flex flex-1 flex-col">
      <div aria-hidden="true" className="fondo-cuaderno absolute inset-x-0 top-0 -z-10 h-[42rem]" />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <MarcaCompacta />
        <Link href="/login" className={`text-sm ${claseEnlace}`}>
          Iniciar sesión
        </Link>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Plataforma de convivencia escolar
          </p>
          <span aria-hidden="true" className="mx-auto mt-3 block h-0.5 w-8 rounded-full bg-highlight" />
          <h1 className="mt-6 text-3xl font-semibold text-primary sm:text-5xl sm:leading-tight">
            Cada situación de convivencia, registrada y con seguimiento.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            CONVI reúne en un expediente digital lo que hoy queda repartido
            entre el libro de clases, planillas, correos y actas: qué ocurrió,
            qué se decidió y qué seguimiento se hizo.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/login" className={`${claseBotonPrimario} px-6`}>
              Iniciar sesión
            </Link>
            <Link href="/registro" className={`${claseBotonSecundario} px-6`}>
              Registrar establecimiento
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
          <ul className="grid gap-4 sm:grid-cols-3">
            {caracteristicas.map(({ titulo, texto, icono }) => (
              <li
                key={titulo}
                className="rounded-2xl border border-border bg-card p-6 shadow-tarjeta"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {icono}
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-semibold">{titulo}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-border">
        <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          CONVI · Seguimiento y trazabilidad de la convivencia escolar
        </p>
      </footer>
    </div>
  );
}
