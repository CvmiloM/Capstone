// Logo de CONVI. Marca es la insignia vertical (acceso, inicio) y
// MarcaCompacta la versión en línea para encabezados.

function IconoLibro({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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
  );
}

export function Marca() {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-tarjeta ring-4 ring-card">
        <IconoLibro className="size-6" />
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

export function MarcaCompacta() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <IconoLibro className="size-4.5" />
      </span>
      <span className="font-serif text-lg font-semibold tracking-[0.18em] text-primary">
        CONVI
      </span>
    </span>
  );
}
