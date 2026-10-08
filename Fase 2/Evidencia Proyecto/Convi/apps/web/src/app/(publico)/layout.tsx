import type { ReactNode } from "react";

function Marca() {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-tarjeta ring-4 ring-card">
        {/* Libro abierto */}
        <svg
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 6.5C9.5 5 6 4.5 3 5.5v13c3-1 6.5-.5 9 1 2.5-1.5 6-2 9-1v-13c-3-1-6.5-.5-9 1Z" />
          <path d="M12 6.5v13" />
        </svg>
      </span>
      <p className="mt-4 font-serif text-2xl font-semibold tracking-[0.2em] text-primary">
        CONVI
      </p>
      <span aria-hidden="true" className="mt-2 h-0.5 w-8 rounded-full bg-highlight" />
      <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Convivencia escolar
      </p>
    </div>
  );
}

export default function LayoutPublico({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate flex flex-1 items-center justify-center px-4 py-12">
      <div aria-hidden="true" className="fondo-cuaderno absolute inset-0 -z-10" />

      <div className="w-full max-w-md">
        <Marca />
        <div className="relative mt-8 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-tarjeta sm:p-8">
          {/* Franja superior, como membrete */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-primary"
          />
          {children}
        </div>
      </div>
    </main>
  );
}
